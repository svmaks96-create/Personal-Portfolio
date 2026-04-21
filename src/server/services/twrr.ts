import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

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
  endDate: string
): TwrrSeries {
  if (tradingCalendar.length === 0 || transactions.length === 0) {
    return EMPTY_SERIES;
  }

  const calendar = tradingCalendar.filter((d) => d >= startDate && d <= endDate);
  if (calendar.length === 0) return EMPTY_SERIES;

  const txByDate = groupTransactionsByDate(transactions);
  const fxByPair = groupFxByPair(fxHistory);
  const priceLookups = buildPriceLookups(priceHistory, transactions);

  const sharesByTicker = new Map<string, Decimal>();
  const currencyByTicker = new Map<string, string>();

  let growth = new Decimal(1);
  let prevMv: Decimal | null = null;

  const series: TwrrPoint[] = [];

  for (const date of calendar) {
    let cf = new Decimal(0);
    const dayTxns = txByDate.get(date) ?? [];

    for (const t of dayTxns) {
      currencyByTicker.set(t.ticker, t.currency);
      const fxRate = forwardFillFxRate(fxByPair, t.currency, t.date);
      if (fxRate === null) continue;
      const rate = new Decimal(fxRate);
      const gross = new Decimal(t.grossAmount);
      const fees = new Decimal(t.fees);
      const qty = new Decimal(t.quantity);
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
 * Walks the trading calendar forward day by day, maintaining per-ticker
 * `shares` and `costBasis` state, and emits {portfolioValue, costBasis} in
 * USD for each date in [startDate, endDate]. Cost-basis semantics match
 * `computePositions` exactly so the terminal value matches the Cost Basis KPI.
 *
 * Rules per transaction (mirroring computation.ts):
 *   buy:      shares += qty; costBasis += (gross + fees) * fx
 *   sell:     costBasis -= (qty / sharesPrior) * costBasis; shares -= qty
 *   fee:      costBasis += fees * fx
 *   dividend: no effect on cost basis
 *
 * Missing FX for a transaction is treated the same way as computation.ts:
 * shares are still updated, but the cost-basis leg for that transaction is
 * skipped. Rare and surfaced elsewhere as a data-quality issue.
 */
export function computeValueVsCostBasisSeries(
  transactions: TransactionInput[],
  priceHistory: Record<string, MarketDataInput[]>,
  fxHistory: FxRateInput[],
  tradingCalendar: string[],
  startDate: string,
  endDate: string,
): ValueVsBasisPoint[] {
  if (tradingCalendar.length === 0 || transactions.length === 0) return [];

  // Walk the whole calendar so per-ticker state accumulates from inception,
  // but only emit points within [startDate, endDate]. This mirrors how
  // sliceAndReanchor handles TWRR period slicing.
  const calendar = tradingCalendar.filter((d) => d <= endDate);
  if (calendar.length === 0) return [];

  const txByDate = groupTransactionsByDate(transactions);
  const fxByPair = groupFxByPair(fxHistory);
  const priceLookups = buildPriceLookups(priceHistory, transactions);

  const sharesByTicker = new Map<string, Decimal>();
  const costBasisByTicker = new Map<string, Decimal>();
  const currencyByTicker = new Map<string, string>();

  const series: ValueVsBasisPoint[] = [];

  for (const date of calendar) {
    const dayTxns = txByDate.get(date) ?? [];

    for (const t of dayTxns) {
      currencyByTicker.set(t.ticker, t.currency);
      const fxRate = forwardFillFxRate(fxByPair, t.currency, t.date);
      const qty = new Decimal(t.quantity);
      const priorShares = sharesByTicker.get(t.ticker) ?? new Decimal(0);
      const priorBasis = costBasisByTicker.get(t.ticker) ?? new Decimal(0);

      switch (t.action) {
        case "buy": {
          sharesByTicker.set(t.ticker, priorShares.plus(qty));
          if (fxRate !== null) {
            const rate = new Decimal(fxRate);
            const buyCost = new Decimal(t.grossAmount).plus(t.fees).times(rate);
            costBasisByTicker.set(t.ticker, priorBasis.plus(buyCost));
          }
          break;
        }
        case "sell": {
          if (priorShares.greaterThan(0)) {
            const reduction = qty.div(priorShares).times(priorBasis);
            costBasisByTicker.set(t.ticker, priorBasis.minus(reduction));
          }
          sharesByTicker.set(t.ticker, priorShares.minus(qty));
          break;
        }
        case "fee": {
          if (fxRate !== null) {
            const rate = new Decimal(fxRate);
            const feeUsd = new Decimal(t.fees).times(rate);
            costBasisByTicker.set(t.ticker, priorBasis.plus(feeUsd));
          }
          break;
        }
        case "dividend":
          break;
      }
    }

    const mv = computeMarketValue(
      sharesByTicker,
      currencyByTicker,
      priceLookups,
      fxByPair,
      date,
    );

    if (date >= startDate) {
      let totalBasis = new Decimal(0);
      for (const basis of costBasisByTicker.values()) totalBasis = totalBasis.plus(basis);

      series.push({
        date,
        portfolioValue: mv.toNumber(),
        costBasis: totalBasis.toNumber(),
      });
    }
  }

  return series;
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

function groupTransactionsByDate(
  txns: TransactionInput[]
): Map<string, TransactionInput[]> {
  const out = new Map<string, TransactionInput[]>();
  const sorted = [...txns].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );
  for (const t of sorted) {
    const existing = out.get(t.date);
    if (existing) {
      existing.push(t);
    } else {
      out.set(t.date, [t]);
    }
  }
  return out;
}

function groupFxByPair(
  fxHistory: FxRateInput[]
): Map<string, MarketDataInput[]> {
  const out = new Map<string, MarketDataInput[]>();
  for (const r of fxHistory) {
    const list = out.get(r.symbol);
    const point = { symbol: r.symbol, date: r.date, value: r.value };
    if (list) {
      list.push(point);
    } else {
      out.set(r.symbol, [point]);
    }
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}

function buildPriceLookups(
  priceHistory: Record<string, MarketDataInput[]>,
  transactions: TransactionInput[]
): Map<string, MarketDataInput[]> {
  const out = new Map<string, MarketDataInput[]>();
  for (const [symbol, rows] of Object.entries(priceHistory)) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    out.set(symbol, sorted);
  }
  seedSyntheticPricesFromFirstBuy(out, transactions);
  return out;
}

/**
 * For each ticker, if no quoted price exists at/before its first buy date,
 * insert a synthetic price at that date using the transaction's effective
 * cost per share (grossAmount / quantity, in the ticker's currency).
 *
 * This handles IPO subscription gaps: shares exist from subscription day
 * but quotes only begin on listing day. Valuing at cost until quotes start
 * keeps day-1 TWRR flat and makes the listing-day price move land on the
 * correct date, instead of collapsing the listing premium into day 1.
 */
function seedSyntheticPricesFromFirstBuy(
  priceLookups: Map<string, MarketDataInput[]>,
  transactions: TransactionInput[]
): void {
  const earliestBuy = new Map<string, TransactionInput>();
  for (const t of transactions) {
    if (t.action !== "buy" || t.quantity <= 0) continue;
    const existing = earliestBuy.get(t.ticker);
    if (!existing || t.date < existing.date) earliestBuy.set(t.ticker, t);
  }

  for (const [ticker, t] of earliestBuy) {
    const list = priceLookups.get(ticker) ?? [];
    const firstKnownDate = list[0]?.date;
    if (firstKnownDate !== undefined && firstKnownDate <= t.date) continue;
    const impliedPrice = t.grossAmount / t.quantity;
    const synthetic: MarketDataInput = {
      symbol: ticker,
      date: t.date,
      value: impliedPrice,
    };
    priceLookups.set(ticker, [synthetic, ...list]);
  }
}

function computeMarketValue(
  shares: Map<string, Decimal>,
  currencyByTicker: Map<string, string>,
  priceLookups: Map<string, MarketDataInput[]>,
  fxByPair: Map<string, MarketDataInput[]>,
  date: string
): Decimal {
  let mv = new Decimal(0);
  for (const [ticker, qty] of shares) {
    if (qty.isZero()) continue;
    const prices = priceLookups.get(ticker);
    if (!prices) continue;
    const price = forwardFillPrice(prices, date);
    if (price === null) continue;
    const currency = currencyByTicker.get(ticker) ?? "USD";
    const fxRate =
      currency === "USD" ? 1 : forwardFillFxRate(fxByPair, currency, date);
    if (fxRate === null) continue;
    mv = mv.plus(qty.times(price).times(fxRate));
  }
  return mv;
}

function forwardFillPrice(
  sorted: MarketDataInput[],
  targetDate: string
): number | null {
  const idx = lastIndexAtOrBefore(sorted, targetDate);
  return idx === -1 ? null : sorted[idx].value;
}

function forwardFillFxRate(
  fxByPair: Map<string, MarketDataInput[]>,
  currency: string,
  targetDate: string
): number | null {
  if (currency === "USD") return 1;
  const list = fxByPair.get(`${currency}USD`);
  if (!list || list.length === 0) return null;
  const idx = lastIndexAtOrBefore(list, targetDate);
  // If the target date predates our FX history, fall back to the earliest
  // known rate — FX rates don't have a "listing day" and the nearest
  // available quote is the best available approximation.
  return idx === -1 ? list[0].value : list[idx].value;
}

/**
 * Binary search: index of last entry whose `date <= targetDate`.
 * Returns -1 when no such entry exists (empty array or target predates all
 * entries). Callers decide how to handle the pre-history case.
 */
function lastIndexAtOrBefore(
  sorted: MarketDataInput[],
  targetDate: string
): number {
  if (sorted.length === 0) return -1;
  let lo = 0;
  let hi = sorted.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].date <= targetDate) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}
