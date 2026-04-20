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
  const priceLookups = buildPriceLookups(priceHistory);

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
  priceHistory: Record<string, MarketDataInput[]>
): Map<string, MarketDataInput[]> {
  const out = new Map<string, MarketDataInput[]>();
  for (const [symbol, rows] of Object.entries(priceHistory)) {
    const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
    out.set(symbol, sorted);
  }
  return out;
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
  if (!list) return null;
  const idx = lastIndexAtOrBefore(list, targetDate);
  return idx === -1 ? null : list[idx].value;
}

/** Binary search: index of last entry whose `date <= targetDate`, or -1. */
function lastIndexAtOrBefore(
  sorted: MarketDataInput[],
  targetDate: string
): number {
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
