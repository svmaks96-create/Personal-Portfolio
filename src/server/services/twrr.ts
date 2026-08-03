import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";
import {
  buildMarkLookups,
  buildPriceLookups,
  computeMarketValue,
  computeOptionValue,
  forwardFillFxRate,
  forwardFillPrice,
  groupFxByPair,
} from "@/server/services/price-lookup";
import { computeDailyHoldings } from "@/server/services/daily-holdings";

/**
 * One trading-day point on a TWRR series.
 * `growthOfDollar` is the chain-linked product (1 for the start day).
 * `marketValueUsd` is the portfolio's USD value at end-of-day on that date.
 */
export interface TwrrPoint {
  date: string;
  growthOfDollar: number;
  marketValueUsd: number;
}

export interface TwrrSeries {
  series: TwrrPoint[];
  cumulativeReturnPct: number | null;
  annualizedReturnPct: number | null;
  startDate: string | null;
  endDate: string | null;
}

const EMPTY_SERIES: TwrrSeries = {
  series: [],
  cumulativeReturnPct: null,
  annualizedReturnPct: null,
  startDate: null,
  endDate: null,
};

/**
 * Total-return time-weighted rate of return (TWRR), chain-linked daily.
 *
 * Convention: end-of-day cash flows. For each day i in the trading calendar:
 *   r_i = (MV(d_i) - CF(d_i)) / MV(d_{i-1})
 * Days where MV(d_{i-1}) < $1 are skipped (handles first deposit and fully
 * closed periods). Dividends are NOT treated as external flows — this is a
 * total-return measure comparable to a buy-and-hold of SPY/QQQ priced series.
 *
 * CF rules (positive = capital injected by user):
 *   buy:      CF += (gross + fees) * fx
 *   sell:     CF -= (gross - fees) * fx
 *   dividend: CF += 0  (internal — keeps value in portfolio)
 *   fee:      CF += 0  (drag absorbed by MV)
 */
export function computePortfolioTWRR(
  transactions: TransactionInput[],
  priceHistory: Record<string, MarketDataInput[]>,
  fxHistory: FxRateInput[],
  tradingCalendar: string[],
  startDate: string,
  endDate: string,
  optionMarkHistory: Record<string, MarketDataInput[]> = {}
): TwrrSeries {
  if (tradingCalendar.length === 0 || transactions.length === 0) {
    return EMPTY_SERIES;
  }

  const calendar = tradingCalendar.filter((d) => d >= startDate && d <= endDate);
  if (calendar.length === 0) return EMPTY_SERIES;

  const fxByPair = groupFxByPair(fxHistory);
  const priceLookups = buildPriceLookups(priceHistory, transactions);
  const markLookups = buildMarkLookups(optionMarkHistory);

  // Pointer-consumed rather than looked up by date. The calendar is SPY's quote
  // dates, but the ledger holds trades made when the US market was shut (UAE
  // listings, the ARM option assignment, some broker-side rows). A date-keyed
  // lookup drops those rows: the position never closes and its exit proceeds
  // never register as an outflow, quietly inflating the return.
  // Scoped to the window, preserving the existing contract that state accrues
  // from the calendar start rather than from inception.
  const ordered = transactions
    .filter((t) => t.date >= startDate)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
  let cursor = 0;

  const sharesByTicker = new Map<string, Decimal>();
  const currencyByTicker = new Map<string, string>();
  const optionSharesByTicker = new Map<string, Decimal>();
  const optionBasisByTicker = new Map<string, Decimal>();
  const lastOptionTxDateByTicker = new Map<string, string>();

  let growth = new Decimal(1);
  let prevMv: Decimal | null = null;

  const series: TwrrPoint[] = [];

  for (const date of calendar) {
    let cf = new Decimal(0);

    const dayTxns: TransactionInput[] = [];
    while (cursor < ordered.length && ordered[cursor].date <= date) {
      dayTxns.push(ordered[cursor]);
      cursor += 1;
    }

    for (const t of dayTxns) {
      if (t.instrument === "stock") currencyByTicker.set(t.ticker, t.currency);
      const fxRate = forwardFillFxRate(fxByPair, t.currency, t.date);
      if (fxRate === null) continue;
      const rate = new Decimal(fxRate);
      const gross = new Decimal(t.grossAmount);
      const fees = new Decimal(t.fees);
      const qty = new Decimal(t.quantity);

      if (t.instrument === "option") {
        // Options carry their own basis pool, never priced off the underlying.
        // Cash-flow contributions mirror stock buys/sells.
        const priorShares = optionSharesByTicker.get(t.ticker) ?? new Decimal(0);
        const priorBasis = optionBasisByTicker.get(t.ticker) ?? new Decimal(0);
        lastOptionTxDateByTicker.set(t.ticker, t.date);
        if (t.action === "buy") {
          optionSharesByTicker.set(t.ticker, priorShares.plus(qty));
          optionBasisByTicker.set(
            t.ticker,
            priorBasis.plus(gross.plus(fees).times(rate))
          );
          cf = cf.plus(gross.plus(fees).times(rate));
        } else if (t.action === "sell") {
          if (priorShares.greaterThan(0)) {
            const reduction = qty.div(priorShares).times(priorBasis);
            optionBasisByTicker.set(t.ticker, priorBasis.minus(reduction));
          }
          optionSharesByTicker.set(t.ticker, priorShares.minus(qty));
          cf = cf.minus(gross.minus(fees).times(rate));
        }
        continue;
      }

      const prior = sharesByTicker.get(t.ticker) ?? new Decimal(0);

      switch (t.action) {
        case "buy":
          sharesByTicker.set(t.ticker, prior.plus(qty));
          cf = cf.plus(gross.plus(fees).times(rate));
          break;
        case "sell":
          sharesByTicker.set(t.ticker, prior.minus(qty));
          cf = cf.minus(gross.minus(fees).times(rate));
          break;
        case "dividend":
        case "fee":
          // Internal — no CF contribution under total-return convention.
          break;
      }
    }

    const mv = computeMarketValue(
      sharesByTicker,
      currencyByTicker,
      priceLookups,
      fxByPair,
      date
    ).plus(
      computeOptionValue(
        optionSharesByTicker,
        optionBasisByTicker,
        lastOptionTxDateByTicker,
        markLookups,
        date
      )
    );

    if (prevMv !== null && prevMv.greaterThanOrEqualTo(1)) {
      const r = mv.minus(cf).div(prevMv);
      growth = growth.times(r);
    }

    series.push({
      date,
      growthOfDollar: growth.toNumber(),
      marketValueUsd: mv.toNumber(),
    });

    prevMv = mv;
  }

  return finalizeSeries(series);
}

/**
 * Buy-and-hold growth-of-$1 series for a benchmark ticker (SPY / QQQ).
 * Both benchmarks trade in USD so no FX handling is required.
 * MV per point = 1.0 * (price(d) / price(d_0)) — we treat it as if $1 was
 * invested on day 0 and never touched.
 */
export function computeBenchmarkSeries(
  symbol: string,
  priceHistory: MarketDataInput[],
  tradingCalendar: string[],
  startDate: string,
  endDate: string
): TwrrSeries {
  if (priceHistory.length === 0 || tradingCalendar.length === 0) {
    return EMPTY_SERIES;
  }

  const calendar = tradingCalendar.filter((d) => d >= startDate && d <= endDate);
  if (calendar.length === 0) return EMPTY_SERIES;

  const sortedPrices = [...priceHistory].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const basePrice = forwardFillPrice(sortedPrices, calendar[0]);
  if (basePrice === null || basePrice === 0) return EMPTY_SERIES;
  const base = new Decimal(basePrice);

  const series: TwrrPoint[] = [];
  for (const date of calendar) {
    const px = forwardFillPrice(sortedPrices, date);
    if (px === null) continue;
    const growth = new Decimal(px).div(base);
    series.push({
      date,
      growthOfDollar: growth.toNumber(),
      marketValueUsd: growth.toNumber(),
    });
  }

  // Mark unused param so TS noUnused doesn't complain when callers pass a label.
  void symbol;

  return finalizeSeries(series);
}

/**
 * One trading-day snapshot of portfolio market value and cost basis in USD.
 */
export interface ValueVsBasisPoint {
  date: string;
  portfolioValue: number;
  costBasis: number;
}

/**
 * Daily portfolio value and cost basis in USD across [startDate, endDate].
 *
 * Delegates to `computeDailyHoldings`, which keeps per-name state keyed by
 * `(portfolio, ticker, instrument)` — the same grouping `computePositions`
 * uses — so the terminal cost basis ties to the Cost Basis KPI exactly.
 *
 * This function previously ran its own walk pooled **by ticker**, which
 * produced a materially different basis once a name was held at two brokers: a
 * sell in one account released basis at the blended cross-broker average
 * instead of that account's own. It also consumed transactions by
 * trading-calendar date, silently dropping rows dated on days the US market
 * was shut, so those positions never closed and their basis lingered forever.
 * On the live ledger those two defects overstated the charted basis by roughly
 * $10.4k. Both are fixed by delegating; the duplicate walk is gone.
 */
export function computeValueVsCostBasisSeries(
  transactions: TransactionInput[],
  priceHistory: Record<string, MarketDataInput[]>,
  fxHistory: FxRateInput[],
  tradingCalendar: string[],
  startDate: string,
  endDate: string,
  optionMarkHistory: Record<string, MarketDataInput[]> = {},
): ValueVsBasisPoint[] {
  return computeDailyHoldings({
    transactions,
    priceHistory,
    fxHistory,
    optionMarkHistory,
    tradingCalendar,
    endDate,
    emitFrom: startDate,
    includeHoldings: false,
  }).map((p) => ({
    date: p.date,
    portfolioValue: p.totalMarketValueUsd,
    costBasis: p.totalCostBasisUsd,
  }));
}

/**
 * Re-anchors an ITD `TwrrSeries` to a sub-period starting at `periodStart`.
 *
 * TWRR is chain-linked, so for any day B in [periodStart, end]:
 *   growth(B) / growth(anchor) = ∏(1 + r_i) for i in [periodStart, B]
 * where `anchor` is the last trading day strictly before `periodStart`
 * (or the series' own first point if `periodStart` predates all data —
 * in which case the operation is a no-op and ITD is returned). This lets
 * callers reuse a single ITD computation across every period button
 * without re-running the TWRR engine.
 */
export function sliceAndReanchor(
  series: TwrrSeries,
  periodStart: string,
): TwrrSeries {
  if (series.series.length === 0) return EMPTY_SERIES;
  const anchor =
    series.series.findLast((p) => p.date < periodStart) ?? series.series[0];
  const base = anchor.growthOfDollar;
  if (base === 0) return EMPTY_SERIES;
  const points = series.series
    .filter((p) => p.date >= periodStart)
    .map((p) => ({ ...p, growthOfDollar: p.growthOfDollar / base }));
  return finalizeSeries(points);
}

function finalizeSeries(series: TwrrPoint[]): TwrrSeries {
  if (series.length === 0) return EMPTY_SERIES;

  const start = series[0];
  const end = series[series.length - 1];
  const cumulativeReturnPct = (end.growthOfDollar - 1) * 100;

  const days = differenceInDays(parseISO(end.date), parseISO(start.date));
  let annualizedReturnPct: number | null = null;
  if (days > 0 && end.growthOfDollar > 0) {
    const years = days / 365.25;
    annualizedReturnPct = (Math.pow(end.growthOfDollar, 1 / years) - 1) * 100;
  }

  return {
    series,
    cumulativeReturnPct,
    annualizedReturnPct,
    startDate: start.date,
    endDate: end.date,
  };
}

// Price / FX / option-mark lookup primitives now live in
// `@/server/services/price-lookup` so the analytics engines can value
// positions with identical semantics. Imported at the top of this file.
