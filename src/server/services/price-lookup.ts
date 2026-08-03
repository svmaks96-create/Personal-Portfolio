import Decimal from "decimal.js";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

/**
 * Shared price / FX / option-mark lookup primitives.
 *
 * These were originally private to `twrr.ts`. They are extracted verbatim so
 * the analytics engines (daily-holdings, counterfactual, episodes) value
 * positions with byte-identical semantics to the TWRR and value-vs-basis
 * series the app already renders. Any divergence here would silently produce
 * analysis numbers that disagree with the dashboard.
 */

/**
 * Binary search: index of last entry whose `date <= targetDate`.
 * Returns -1 when no such entry exists (empty array or target predates all
 * entries). Callers decide how to handle the pre-history case.
 */
export function lastIndexAtOrBefore(
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

export function forwardFillPrice(
  sorted: MarketDataInput[],
  targetDate: string
): number | null {
  const idx = lastIndexAtOrBefore(sorted, targetDate);
  return idx === -1 ? null : sorted[idx].value;
}

/**
 * Like `forwardFillPrice` but also reports which observation was used, so
 * callers can surface staleness instead of silently carrying a dead quote.
 */
export function forwardFillPriceDated(
  sorted: MarketDataInput[],
  targetDate: string
): { value: number; date: string } | null {
  const idx = lastIndexAtOrBefore(sorted, targetDate);
  return idx === -1 ? null : { value: sorted[idx].value, date: sorted[idx].date };
}

export function forwardFillFxRate(
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

export function groupTransactionsByDate(
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

export function groupFxByPair(
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

export function buildPriceLookups(
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
export function seedSyntheticPricesFromFirstBuy(
  priceLookups: Map<string, MarketDataInput[]>,
  transactions: TransactionInput[]
): void {
  const earliestBuy = new Map<string, TransactionInput>();
  for (const t of transactions) {
    // Option rows must never seed a synthetic price for the underlying
    if (t.instrument !== "stock" || t.action !== "buy" || t.quantity <= 0) continue;
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

export function buildMarkLookups(
  optionMarkHistory: Record<string, MarketDataInput[]>
): Map<string, MarketDataInput[]> {
  const out = new Map<string, MarketDataInput[]>();
  for (const [ticker, rows] of Object.entries(optionMarkHistory)) {
    out.set(ticker, [...rows].sort((a, b) => a.date.localeCompare(b.date)));
  }
  return out;
}

/**
 * Total USD value of open option positions on `date`. Each underlying is
 * valued at its latest mark at/before `date`, but only when that mark
 * postdates the last option trade seen so far (a trade invalidates the
 * previous total-value mark); otherwise the position is carried at cost.
 */
export function computeOptionValue(
  optionShares: Map<string, Decimal>,
  optionBasis: Map<string, Decimal>,
  lastOptionTxDate: Map<string, string>,
  markLookups: Map<string, MarketDataInput[]>,
  date: string
): Decimal {
  let total = new Decimal(0);
  for (const [ticker, qty] of optionShares) {
    if (qty.lessThanOrEqualTo(0)) continue;
    const basis = optionBasis.get(ticker) ?? new Decimal(0);
    const marks = markLookups.get(ticker);
    const lastTx = lastOptionTxDate.get(ticker) ?? "";
    let value = basis;
    if (marks) {
      const idx = lastIndexAtOrBefore(marks, date);
      if (idx !== -1 && marks[idx].date >= lastTx) {
        value = new Decimal(marks[idx].value);
      }
    }
    total = total.plus(value);
  }
  return total;
}

export function computeMarketValue(
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
