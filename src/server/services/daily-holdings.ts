import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import {
  buildMarkLookups,
  buildPriceLookups,
  forwardFillFxRate,
  forwardFillPriceDated,
  groupFxByPair,
  lastIndexAtOrBefore,
} from "@/server/services/price-lookup";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

/**
 * Per-name daily portfolio state.
 *
 * `computeValueVsCostBasisSeries` already walks the calendar but emits only
 * portfolio totals, and it pools state **by ticker**. Attribution and the
 * counterfactual engine both need per-holding detail, and the pooling is
 * actively wrong once the same ticker is held in two brokers: a sell in one
 * account releases cost basis at the blended cross-broker average rather than
 * that account's own. This walk keys by `(portfolio, ticker, instrument)` —
 * the same grouping `computePositions` uses — so terminal cost basis ties to
 * the app's Cost Basis KPI rather than to the (defective) chart series.
 *
 * Total market value is identical under either keying, so the two remain
 * comparable there; cost basis deliberately is not.
 *
 * The second deviation is diagnostic. The existing engine drops a holding with
 * no quote silently, contributing $0 — which reads downstream as a real
 * negative return rather than absent data. Here every point carries
 * `staleValueShare` and `unpricedShareCount` so a fabricated stretch of curve
 * is visible instead of invisible.
 */

export const DEFAULT_STALE_THRESHOLD_DAYS = 7;
const SHARE_EPSILON = 1e-9;

export interface DailyHolding {
  key: string;
  portfolio: string;
  ticker: string;
  instrument: "stock" | "option";
  shares: number;
  marketValueUsd: number;
  costBasisUsd: number;
  /** Positive = capital injected by the user on this date. */
  externalFlowUsd: number;
  dividendUsd: number;
  priceUsed: number | null;
  /** Date of the quote actually used — may lag `date`. */
  priceDate: string | null;
  isStale: boolean;
  /** Option position carried at cost because no mark postdates its last trade. */
  valuedAtCost: boolean;
}

export interface DailyHoldingsPoint {
  date: string;
  totalMarketValueUsd: number;
  totalCostBasisUsd: number;
  totalExternalFlowUsd: number;
  totalDividendUsd: number;
  /** Fraction of market value priced off a stale quote (0..1). */
  staleValueShare: number;
  /** Holdings with shares but no quote at all — they contribute $0 silently. */
  unpricedShareCount: number;
  holdings: DailyHolding[];
}

export interface DailyHoldingsInput {
  transactions: TransactionInput[];
  priceHistory: Record<string, MarketDataInput[]>;
  fxHistory: FxRateInput[];
  optionMarkHistory?: Record<string, MarketDataInput[]>;
  tradingCalendar: string[];
  endDate: string;
  /** State always accrues from the calendar start; emission begins here. */
  emitFrom?: string;
  staleThresholdDays?: number;
  /**
   * Set false when only the daily totals are needed. Skips building the
   * per-holding array — roughly 125k object allocations over this ledger's
   * full history — while leaving every total identical.
   */
  includeHoldings?: boolean;
}

interface HoldingState {
  key: string;
  portfolio: string;
  ticker: string;
  instrument: "stock" | "option";
  currency: string;
  shares: Decimal;
  costBasis: Decimal;
  lastOptionTxDate: string;
}

export function computeDailyHoldings(input: DailyHoldingsInput): DailyHoldingsPoint[] {
  const {
    transactions,
    priceHistory,
    fxHistory,
    optionMarkHistory = {},
    tradingCalendar,
    endDate,
    emitFrom,
    staleThresholdDays = DEFAULT_STALE_THRESHOLD_DAYS,
    includeHoldings = true,
  } = input;

  if (tradingCalendar.length === 0 || transactions.length === 0) return [];

  const calendar = tradingCalendar.filter((d) => d <= endDate);
  if (calendar.length === 0) return [];

  const fxByPair = groupFxByPair(fxHistory);
  const priceLookups = buildPriceLookups(priceHistory, transactions);
  const markLookups = buildMarkLookups(optionMarkHistory);

  // Consumed with a moving pointer rather than a per-date lookup. The trading
  // calendar is SPY's quote dates, but the ledger contains trades on days the
  // US market was shut — UAE listings settle on their own calendar, and some
  // broker-side rows land on weekends. A date-keyed lookup drops those rows
  // entirely and the position never closes; folding them into the next trading
  // day keeps every share accounted for.
  const ordered = [...transactions].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id - b.id
  );
  let cursor = 0;

  const states = new Map<string, HoldingState>();
  const out: DailyHoldingsPoint[] = [];

  for (const date of calendar) {
    const flowByKey = new Map<string, Decimal>();
    const dividendByKey = new Map<string, Decimal>();

    const dayTxns: TransactionInput[] = [];
    while (cursor < ordered.length && ordered[cursor].date <= date) {
      dayTxns.push(ordered[cursor]);
      cursor += 1;
    }

    for (const t of dayTxns) {
      const key = `${t.portfolio}::${t.ticker}::${t.instrument}`;
      const state = states.get(key) ?? newState(key, t);
      states.set(key, state);

      const fx = forwardFillFxRate(fxByPair, t.currency, t.date);
      const qty = new Decimal(t.quantity);
      const gross = new Decimal(t.grossAmount);
      const fees = new Decimal(t.fees);

      if (t.instrument === "option") state.lastOptionTxDate = t.date;

      switch (t.action) {
        case "buy": {
          state.shares = state.shares.plus(qty);
          if (fx !== null) {
            const cost = gross.plus(fees).times(fx);
            state.costBasis = state.costBasis.plus(cost);
            addTo(flowByKey, key, cost);
          }
          break;
        }
        case "sell": {
          if (state.shares.greaterThan(0)) {
            state.costBasis = state.costBasis.minus(
              qty.div(state.shares).times(state.costBasis)
            );
          }
          state.shares = state.shares.minus(qty);
          if (fx !== null) addTo(flowByKey, key, gross.minus(fees).times(fx).neg());
          break;
        }
        case "fee": {
          // Capitalized into basis exactly as computePositions does (reading
          // the `fees` column, not `grossAmount`). Deliberately NOT an external
          // flow: a fee is money leaving to a third party, so it belongs in the
          // return as drag, not as a contribution. Matches computePortfolioTWRR.
          if (fx !== null) {
            state.costBasis = state.costBasis.plus(fees.times(fx));
          }
          break;
        }
        case "dividend": {
          if (fx !== null) addTo(dividendByKey, key, gross.times(fx));
          break;
        }
      }
    }

    if (emitFrom !== undefined && date < emitFrom) continue;

    const holdings: DailyHolding[] = [];
    let totalMv = new Decimal(0);
    let totalBasis = new Decimal(0);
    let totalFlow = new Decimal(0);
    let totalDiv = new Decimal(0);
    let staleMv = new Decimal(0);
    let unpriced = 0;

    for (const [key, state] of states) {
      const flow = flowByKey.get(key) ?? new Decimal(0);
      const dividend = dividendByKey.get(key) ?? new Decimal(0);
      const hasShares = state.shares.abs().greaterThan(SHARE_EPSILON);

      if (!hasShares && flow.isZero() && dividend.isZero()) continue;

      const valued = valueHolding(
        state,
        date,
        priceLookups,
        markLookups,
        fxByPair,
        staleThresholdDays
      );

      if (hasShares && valued.unpriced) unpriced += 1;

      const mv = valued.marketValue;
      totalMv = totalMv.plus(mv);
      totalBasis = totalBasis.plus(state.costBasis);
      totalFlow = totalFlow.plus(flow);
      totalDiv = totalDiv.plus(dividend);
      if (valued.isStale) staleMv = staleMv.plus(mv);

      if (!includeHoldings) continue;

      holdings.push({
        key,
        portfolio: state.portfolio,
        ticker: state.ticker,
        instrument: state.instrument,
        shares: state.shares.toNumber(),
        marketValueUsd: mv.toNumber(),
        costBasisUsd: state.costBasis.toNumber(),
        externalFlowUsd: flow.toNumber(),
        dividendUsd: dividend.toNumber(),
        priceUsed: valued.price,
        priceDate: valued.priceDate,
        isStale: valued.isStale,
        valuedAtCost: valued.valuedAtCost,
      });
    }

    out.push({
      date,
      totalMarketValueUsd: totalMv.toNumber(),
      totalCostBasisUsd: totalBasis.toNumber(),
      totalExternalFlowUsd: totalFlow.toNumber(),
      totalDividendUsd: totalDiv.toNumber(),
      staleValueShare: totalMv.isZero()
        ? 0
        : staleMv.div(totalMv).toNumber(),
      unpricedShareCount: unpriced,
      holdings,
    });
  }

  return out;
}

export interface HoldingsTwrrPoint {
  date: string;
  growthOfDollar: number;
  marketValueUsd: number;
  externalFlowUsd: number;
}

/**
 * Chain-linked TWRR derived from this walk rather than from
 * `computePortfolioTWRR`.
 *
 * Same end-of-day convention — `r_i = (MV_i − CF_i) / MV_{i−1}`, dividends
 * internal, days with a sub-$1 prior value skipped — so the result is directly
 * comparable to `computeBenchmarkSeries`. The reason for a separate
 * implementation is the input, not the formula: the existing engine drops
 * transactions dated on non-trading days, which for this ledger means the ARM
 * option assignment ($10,000, 2026-07-17) and four GDEVW sells never register.
 * Those positions therefore never close and their exit proceeds never appear as
 * an outflow, quietly inflating recent returns.
 */
export function computeTwrrFromHoldings(
  points: DailyHoldingsPoint[]
): HoldingsTwrrPoint[] {
  const out: HoldingsTwrrPoint[] = [];
  let growth = new Decimal(1);
  let prevMv: Decimal | null = null;

  for (const p of points) {
    const mv = new Decimal(p.totalMarketValueUsd);
    const cf = new Decimal(p.totalExternalFlowUsd);
    if (prevMv !== null && prevMv.greaterThanOrEqualTo(1)) {
      growth = growth.times(mv.minus(cf).div(prevMv));
    }
    out.push({
      date: p.date,
      growthOfDollar: growth.toNumber(),
      marketValueUsd: p.totalMarketValueUsd,
      externalFlowUsd: p.totalExternalFlowUsd,
    });
    prevMv = mv;
  }

  return out;
}

function newState(key: string, t: TransactionInput): HoldingState {
  return {
    key,
    portfolio: t.portfolio,
    ticker: t.ticker,
    instrument: t.instrument,
    currency: t.currency,
    shares: new Decimal(0),
    costBasis: new Decimal(0),
    lastOptionTxDate: "",
  };
}

function addTo(map: Map<string, Decimal>, key: string, amount: Decimal): void {
  map.set(key, (map.get(key) ?? new Decimal(0)).plus(amount));
}

interface ValuedHolding {
  marketValue: Decimal;
  price: number | null;
  priceDate: string | null;
  isStale: boolean;
  valuedAtCost: boolean;
  unpriced: boolean;
}

function valueHolding(
  state: HoldingState,
  date: string,
  priceLookups: Map<string, MarketDataInput[]>,
  markLookups: Map<string, MarketDataInput[]>,
  fxByPair: Map<string, MarketDataInput[]>,
  staleThresholdDays: number
): ValuedHolding {
  const zero = new Decimal(0);

  if (state.shares.abs().lessThanOrEqualTo(SHARE_EPSILON)) {
    return {
      marketValue: zero,
      price: null,
      priceDate: null,
      isStale: false,
      valuedAtCost: false,
      unpriced: false,
    };
  }

  if (state.instrument === "option") {
    // Same rule as computePositions: a mark is only usable if it postdates the
    // last option trade, since marks are a total for the underlying and a new
    // trade invalidates the previous total.
    const marks = markLookups.get(state.ticker);
    if (marks) {
      const idx = lastIndexAtOrBefore(marks, date);
      if (idx !== -1 && marks[idx].date >= state.lastOptionTxDate) {
        return {
          marketValue: new Decimal(marks[idx].value),
          price: marks[idx].value,
          priceDate: marks[idx].date,
          isStale: false,
          valuedAtCost: false,
          unpriced: false,
        };
      }
    }
    return {
      marketValue: state.costBasis,
      price: null,
      priceDate: null,
      isStale: false,
      valuedAtCost: true,
      unpriced: false,
    };
  }

  const prices = priceLookups.get(state.ticker);
  const quote = prices ? forwardFillPriceDated(prices, date) : null;
  if (quote === null) {
    return {
      marketValue: zero,
      price: null,
      priceDate: null,
      isStale: false,
      valuedAtCost: false,
      unpriced: true,
    };
  }

  const fx =
    state.currency === "USD" ? 1 : forwardFillFxRate(fxByPair, state.currency, date);
  if (fx === null) {
    return {
      marketValue: zero,
      price: quote.value,
      priceDate: quote.date,
      isStale: false,
      valuedAtCost: false,
      unpriced: true,
    };
  }

  const lagDays = differenceInDays(parseISO(date), parseISO(quote.date));
  return {
    marketValue: state.shares.times(quote.value).times(fx),
    price: quote.value,
    priceDate: quote.date,
    isStale: lagDays > staleThresholdDays,
    valuedAtCost: false,
    unpriced: false,
  };
}
