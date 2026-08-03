import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import { computeXIRR } from "@/server/services/computation";
import {
  buildPriceLookups,
  forwardFillPriceDated,
} from "@/server/services/price-lookup";
import type { DailyHoldingsPoint } from "@/server/services/daily-holdings";
import type { TransactionInput, MarketDataInput } from "@/server/types/positions";

/**
 * Counterfactuals for "would doing nothing have worked better?".
 *
 * Two constructions, deliberately answering different questions:
 *
 * **Frozen book** — take the positions held on a freeze date, stop trading, and
 * carry them forward. Compared on TWRR, not dollars. The actual portfolio took
 * on large new contributions after any plausible freeze date while the frozen
 * book takes none, and TWRR is contribution-insensitive by construction — so
 * the comparison is fair without inventing a contribution policy. Every policy
 * available (pro-rata, default-to-index, none) is an assumption that would then
 * need defending; sidestepping beats solving here.
 *
 * **Deposits-only benchmark (CF-C)** — every dollar ever committed goes into a
 * single index and stays. Derived from the high-water mark of cumulative net
 * invested, so it only ever adds. That matters: a raw daily flow schedule would
 * make the benchmark go to cash alongside the investor during the Aug–Nov 2025
 * risk-off, which tests timing rather than "just buy the index".
 *
 * Both are price-return, matching the rest of the engine. Dividend drag is
 * quantified as a scalar rather than modelled — `ticker_dividends` is a rolling
 * last-12-payments snapshot, not a history, and is time-truncated exactly where
 * a 2024-12-31 freeze would need it.
 */

export interface FrozenPosition {
  ticker: string;
  instrument: "stock" | "option";
  portfolio: string;
  shares: number;
  startPrice: number;
  startValueUsd: number;
  endPrice: number | null;
  endPriceDate: string | null;
  endValueUsd: number;
  /** Its price series died before the valuation date. */
  isDeadSeries: boolean;
}

export interface CounterfactualPoint {
  date: string;
  valueUsd: number;
  growthOfDollar: number;
}

export interface FrozenBookResult {
  freezeDate: string;
  asOf: string;
  positions: FrozenPosition[];
  startValueUsd: number;
  endValueUsd: number;
  cumulativeReturnPct: number | null;
  annualizedReturnPct: number | null;
  series: CounterfactualPoint[];
  /** Option basis dropped from the frozen book — options cannot be carried. */
  excludedOptionBasisUsd: number;
  /** Share of terminal frozen value priced off a series that stopped updating. */
  deadSeriesShareOfEndPct: number;
  /** Weighted trailing yield of the frozen book, if yields were supplied. */
  estimatedDividendYieldPct: number | null;
}

export interface FrozenBookOptions {
  freezeDate: string;
  asOf: string;
  tradingCalendar: string[];
  priceHistory: Record<string, MarketDataInput[]>;
  transactions: TransactionInput[];
  /** Trailing 12-month distribution yield per ticker, in percent. */
  trailingYieldPctByTicker?: Record<string, number>;
}

export function computeFrozenBook(
  points: DailyHoldingsPoint[],
  options: FrozenBookOptions
): FrozenBookResult {
  const {
    freezeDate,
    asOf,
    tradingCalendar,
    priceHistory,
    transactions,
    trailingYieldPctByTicker,
  } = options;

  const priceLookups = buildPriceLookups(priceHistory, transactions);
  const anchor = findLastAtOrBefore(points, freezeDate);

  const empty: FrozenBookResult = {
    freezeDate,
    asOf,
    positions: [],
    startValueUsd: 0,
    endValueUsd: 0,
    cumulativeReturnPct: null,
    annualizedReturnPct: null,
    series: [],
    excludedOptionBasisUsd: 0,
    deadSeriesShareOfEndPct: 0,
    estimatedDividendYieldPct: null,
  };
  if (anchor === null) return empty;

  // Options are excluded outright: there is no way to carry one forward
  // without a mark series, and the ledger holds five marks in total.
  let excludedOptionBasisUsd = 0;
  const held = anchor.holdings.filter((h) => {
    if (Math.abs(h.shares) <= 1e-9) return false;
    if (h.instrument === "option") {
      excludedOptionBasisUsd += h.costBasisUsd;
      return false;
    }
    return true;
  });

  if (held.length === 0) return { ...empty, excludedOptionBasisUsd };

  const calendar = tradingCalendar.filter((d) => d >= anchor.date && d <= asOf);
  if (calendar.length === 0) return { ...empty, excludedOptionBasisUsd };

  const series: CounterfactualPoint[] = [];
  let baseValue: Decimal | null = null;

  for (const date of calendar) {
    let value = new Decimal(0);
    for (const h of held) {
      const quote = forwardFillPriceDated(priceLookups.get(h.ticker) ?? [], date);
      if (quote === null) continue;
      value = value.plus(new Decimal(h.shares).times(quote.value));
    }
    if (baseValue === null) baseValue = value;
    series.push({
      date,
      valueUsd: value.toNumber(),
      growthOfDollar: baseValue.isZero() ? 1 : value.div(baseValue).toNumber(),
    });
  }

  const startValueUsd = series[0]?.valueUsd ?? 0;
  const endValueUsd = series[series.length - 1]?.valueUsd ?? 0;

  // "Dead" is relative to the market, not to `asOf`. The valuation date may be
  // pushed past the last quote date (to pick up a fresher option mark), so
  // comparing against it would flag every series as stale. The reference is the
  // newest quote any held name still has.
  let marketLastDate = "";
  for (const h of held) {
    const lookup = priceLookups.get(h.ticker) ?? [];
    const last = lookup[lookup.length - 1]?.date ?? "";
    if (last > marketLastDate) marketLastDate = last;
  }

  const positions: FrozenPosition[] = [];
  let deadEndValue = new Decimal(0);
  for (const h of held) {
    const lookup = priceLookups.get(h.ticker) ?? [];
    const startQuote = forwardFillPriceDated(lookup, anchor.date);
    const endQuote = forwardFillPriceDated(lookup, asOf);
    const isDead = endQuote !== null && seriesEndsBefore(lookup, marketLastDate);
    const endValue = endQuote ? h.shares * endQuote.value : 0;
    if (isDead) deadEndValue = deadEndValue.plus(endValue);
    positions.push({
      ticker: h.ticker,
      instrument: h.instrument,
      portfolio: h.portfolio,
      shares: h.shares,
      startPrice: startQuote?.value ?? 0,
      startValueUsd: startQuote ? h.shares * startQuote.value : 0,
      endPrice: endQuote?.value ?? null,
      endPriceDate: endQuote?.date ?? null,
      endValueUsd: endValue,
      isDeadSeries: isDead,
    });
  }
  positions.sort((a, b) => b.endValueUsd - a.endValueUsd);

  let estimatedDividendYieldPct: number | null = null;
  if (trailingYieldPctByTicker && startValueUsd > 0) {
    let weighted = new Decimal(0);
    for (const p of positions) {
      const y = trailingYieldPctByTicker[p.ticker];
      if (y === undefined) continue;
      weighted = weighted.plus(new Decimal(p.startValueUsd).times(y));
    }
    estimatedDividendYieldPct = weighted.div(startValueUsd).toNumber();
  }

  return {
    freezeDate,
    asOf,
    positions,
    startValueUsd,
    endValueUsd,
    cumulativeReturnPct:
      startValueUsd > 0 ? (endValueUsd / startValueUsd - 1) * 100 : null,
    annualizedReturnPct: annualize(
      startValueUsd > 0 ? endValueUsd / startValueUsd : null,
      series[0]?.date,
      series[series.length - 1]?.date
    ),
    series,
    excludedOptionBasisUsd,
    deadSeriesShareOfEndPct:
      endValueUsd > 0 ? deadEndValue.div(endValueUsd).times(100).toNumber() : 0,
    estimatedDividendYieldPct,
  };
}

export interface SyntheticResult {
  /** Display label, e.g. "All-in SPY" or "60/40 VTI/BND". */
  label: string;
  symbol: string;
  schedule: FlowSchedule;
  startDate: string;
  endDate: string;
  series: CounterfactualPoint[];
  totalDepositedUsd: number;
  endValueUsd: number;
  cumulativeReturnPct: number | null;
  annualizedReturnPct: number | null;
  /** Money-weighted, directly comparable to computePortfolioIRR. */
  xirrPct: number | null;
  /** Deposit schedule actually used, for auditability. */
  deposits: { date: string; amountUsd: number }[];
  /**
   * True when any leg carries an assumed distribution yield rather than a
   * measured one. Every figure on such a row must be labelled MODELLED.
   */
  isModeled: boolean;
  modelNote: string | null;
}

/**
 * How the capital-commitment schedule is derived from the ledger.
 *
 * `deposits-only` — high-water mark of cumulative net invested. Only ever adds.
 * `raw-daily`     — the day's net flow verbatim, sells included.
 * `monthly-netted`— raw flows aggregated per calendar month.
 *
 * These answer different questions. `raw-daily` and `monthly-netted` take the
 * benchmark to cash whenever the investor did, so they measure *security
 * selection* holding timing constant. `deposits-only` keeps the benchmark fully
 * invested throughout and so measures the combination of selection and timing —
 * it is the honest answer to "what if I had just bought the index and stopped".
 */
export type FlowSchedule = "deposits-only" | "raw-daily" | "monthly-netted";

export interface SyntheticLeg {
  symbol: string;
  /** Fraction of each contribution, summing to 1 across legs. */
  weight: number;
  /**
   * Assumed annual distribution yield in percent. Supplying this makes the
   * result MODELLED. Needed for any bond leg: BND's price return is about -16%
   * inception-to-date against a roughly flat total return, so a price-only
   * 60/40 would understate the alternative by double digits.
   */
  modeledYieldPct?: number;
}

export interface SyntheticPortfolioOptions {
  label: string;
  legs: SyntheticLeg[];
  schedule: FlowSchedule;
  priceHistory: Record<string, MarketDataInput[]>;
  tradingCalendar: string[];
  startDate: string;
  endDate: string;
  rebalance?: "none" | "annual";
}

const TRADING_DAYS = 252;

/**
 * Runs a synthetic alternative portfolio over a derived contribution schedule.
 *
 * Chain-links with the same end-of-day flow convention as the portfolio TWRR so
 * the growth series are directly comparable, and also computes XIRR so the
 * money-weighted view lines up with `computePortfolioIRR`. The two often
 * disagree sharply, and that disagreement is itself the finding.
 */
export function computeSyntheticPortfolio(
  points: DailyHoldingsPoint[],
  options: SyntheticPortfolioOptions
): SyntheticResult {
  const {
    label,
    legs,
    schedule,
    priceHistory,
    tradingCalendar,
    startDate,
    endDate,
    rebalance = "none",
  } = options;

  const calendar = tradingCalendar.filter((d) => d >= startDate && d <= endDate);
  const lookups = new Map<string, MarketDataInput[]>();
  for (const leg of legs) {
    lookups.set(
      leg.symbol,
      [...(priceHistory[leg.symbol] ?? [])].sort((a, b) => a.date.localeCompare(b.date))
    );
  }

  const isModeled = legs.some((l) => (l.modeledYieldPct ?? 0) > 0);
  const modelNote = isModeled
    ? legs
        .filter((l) => (l.modeledYieldPct ?? 0) > 0)
        .map((l) => `${l.symbol} assumes a ${l.modeledYieldPct}%/yr distribution yield`)
        .join("; ")
    : null;

  const symbol = legs.map((l) => l.symbol).join("/");
  const empty: SyntheticResult = {
    label,
    symbol,
    schedule,
    startDate,
    endDate,
    series: [],
    totalDepositedUsd: 0,
    endValueUsd: 0,
    cumulativeReturnPct: null,
    annualizedReturnPct: null,
    xirrPct: null,
    deposits: [],
    isModeled,
    modelNote,
  };
  if (calendar.length === 0 || legs.length === 0) return empty;
  if (legs.every((l) => (lookups.get(l.symbol) ?? []).length === 0)) return empty;

  const flowByDate = buildFlowSchedule(points, calendar, endDate, schedule);

  const units = new Map<string, Decimal>();
  for (const leg of legs) units.set(leg.symbol, new Decimal(0));

  let totalDeposited = new Decimal(0);
  let growth = new Decimal(1);
  let prevValue: Decimal | null = null;
  let prevYear = calendar[0].slice(0, 4);

  const series: CounterfactualPoint[] = [];
  const deposits: { date: string; amountUsd: number }[] = [];
  const flows: { date: string; amount: number }[] = [];

  const priceOn = (sym: string, date: string): number | null => {
    const quote = forwardFillPriceDated(lookups.get(sym) ?? [], date);
    return quote === null || quote.value <= 0 ? null : quote.value;
  };

  const valueOn = (date: string): Decimal => {
    let total = new Decimal(0);
    for (const leg of legs) {
      const price = priceOn(leg.symbol, date);
      if (price === null) continue;
      total = total.plus((units.get(leg.symbol) ?? new Decimal(0)).times(price));
    }
    return total;
  };

  for (const date of calendar) {
    const year = date.slice(0, 4);
    if (rebalance === "annual" && year !== prevYear && legs.length > 1) {
      const total = valueOn(date);
      if (total.greaterThan(0)) {
        for (const leg of legs) {
          const price = priceOn(leg.symbol, date);
          if (price === null) continue;
          units.set(leg.symbol, total.times(leg.weight).div(price));
        }
      }
      prevYear = year;
    }

    const flow = new Decimal(flowByDate.get(date) ?? 0);
    if (!flow.isZero()) {
      for (const leg of legs) {
        const price = priceOn(leg.symbol, date);
        if (price === null) continue;
        const legFlow = flow.times(leg.weight);
        units.set(
          leg.symbol,
          (units.get(leg.symbol) ?? new Decimal(0)).plus(legFlow.div(price))
        );
      }
      if (flow.greaterThan(0)) {
        totalDeposited = totalDeposited.plus(flow);
        deposits.push({ date, amountUsd: flow.toNumber() });
      }
      flows.push({ date, amount: flow.neg().toNumber() });
    }

    // Modelled distributions accrue as extra units, never as external flow.
    for (const leg of legs) {
      const y = leg.modeledYieldPct ?? 0;
      if (y === 0) continue;
      units.set(
        leg.symbol,
        (units.get(leg.symbol) ?? new Decimal(0)).times(1 + y / 100 / TRADING_DAYS)
      );
    }

    const value = valueOn(date);
    if (prevValue !== null && prevValue.greaterThanOrEqualTo(1)) {
      growth = growth.times(value.minus(flow).div(prevValue));
    }
    series.push({
      date,
      valueUsd: value.toNumber(),
      growthOfDollar: growth.toNumber(),
    });
    prevValue = value;
  }

  const endValueUsd = series[series.length - 1]?.valueUsd ?? 0;
  if (endValueUsd > 0) {
    flows.push({ date: calendar[calendar.length - 1], amount: endValueUsd });
  }

  return {
    label,
    symbol,
    schedule,
    startDate: calendar[0],
    endDate: calendar[calendar.length - 1],
    series,
    totalDepositedUsd: totalDeposited.toNumber(),
    endValueUsd,
    cumulativeReturnPct: (growth.toNumber() - 1) * 100,
    annualizedReturnPct: annualize(
      growth.toNumber(),
      calendar[0],
      calendar[calendar.length - 1]
    ),
    xirrPct: computeXIRR(flows),
    deposits,
    isModeled,
    modelNote,
  };
}

function buildFlowSchedule(
  points: DailyHoldingsPoint[],
  calendar: string[],
  endDate: string,
  schedule: FlowSchedule
): Map<string, number> {
  const raw = new Map<string, number>();
  for (const p of points) {
    if (p.date > endDate) continue;
    raw.set(p.date, (raw.get(p.date) ?? 0) + p.totalExternalFlowUsd);
  }

  if (schedule === "raw-daily") return raw;

  if (schedule === "monthly-netted") {
    const byMonth = new Map<string, number>();
    for (const [date, amount] of raw) {
      const month = date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + amount);
    }
    // Apply each month's net on its last trading day in the calendar.
    const lastDayOfMonth = new Map<string, string>();
    for (const date of calendar) lastDayOfMonth.set(date.slice(0, 7), date);
    const out = new Map<string, number>();
    for (const [month, amount] of byMonth) {
      const date = lastDayOfMonth.get(month);
      if (date === undefined) continue;
      out.set(date, (out.get(date) ?? 0) + amount);
    }
    return out;
  }

  // deposits-only: increments of the high-water mark of cumulative net invested.
  const out = new Map<string, number>();
  let cumulative = new Decimal(0);
  let highWater = new Decimal(0);
  for (const date of calendar) {
    cumulative = cumulative.plus(raw.get(date) ?? 0);
    if (cumulative.greaterThan(highWater)) {
      out.set(date, cumulative.minus(highWater).toNumber());
      highWater = cumulative;
    }
  }
  return out;
}

export interface DepositsOnlyOptions {
  symbol: string;
  priceSeries: MarketDataInput[];
  tradingCalendar: string[];
  startDate: string;
  endDate: string;
}

/**
 * Single-symbol, deposits-only alternative. Thin wrapper over
 * `computeSyntheticPortfolio` kept because it is the headline comparison.
 */
export function computeDepositsOnlyBenchmark(
  points: DailyHoldingsPoint[],
  options: DepositsOnlyOptions
): SyntheticResult {
  const { symbol, priceSeries, tradingCalendar, startDate, endDate } = options;
  return computeSyntheticPortfolio(points, {
    label: `All-in ${symbol}`,
    legs: [{ symbol, weight: 1 }],
    schedule: "deposits-only",
    priceHistory: { [symbol]: priceSeries },
    tradingCalendar,
    startDate,
    endDate,
  });
}

/** Cumulative net invested at each point, plus its running high-water mark. */
export function computeNetInvestedSeries(
  points: DailyHoldingsPoint[]
): { date: string; cumulativeUsd: number; highWaterUsd: number }[] {
  let cumulative = new Decimal(0);
  let highWater = new Decimal(0);
  return points.map((p) => {
    cumulative = cumulative.plus(p.totalExternalFlowUsd);
    if (cumulative.greaterThan(highWater)) highWater = cumulative;
    return {
      date: p.date,
      cumulativeUsd: cumulative.toNumber(),
      highWaterUsd: highWater.toNumber(),
    };
  });
}

function findLastAtOrBefore(
  points: DailyHoldingsPoint[],
  date: string
): DailyHoldingsPoint | null {
  let best: DailyHoldingsPoint | null = null;
  for (const p of points) {
    if (p.date <= date) best = p;
    else break;
  }
  return best;
}

function seriesEndsBefore(series: MarketDataInput[], date: string): boolean {
  if (series.length === 0) return true;
  return series[series.length - 1].date < date;
}

function annualize(
  growth: number | null,
  start: string | undefined,
  end: string | undefined
): number | null {
  if (growth === null || growth <= 0 || start === undefined || end === undefined) {
    return null;
  }
  const days = differenceInDays(parseISO(end), parseISO(start));
  if (days <= 0) return null;
  return (Math.pow(growth, 365.25 / days) - 1) * 100;
}
