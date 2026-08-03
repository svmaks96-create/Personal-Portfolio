import { pearson, stdevSample } from "@/server/services/series-utils";
import { TRADING_DAYS_PER_YEAR, type DailyReturn } from "@/server/services/risk-metrics";
import { forwardFillPriceDated } from "@/server/services/price-lookup";
import type { MarketDataInput } from "@/server/types/positions";

/**
 * Pairwise correlation and concentration across currently-held names.
 *
 * The honest handling of thin coverage is the point of this module. Several
 * holdings have far less history than the correlation window — one has nine
 * price rows against a 252-day window. Rather than silently padding or
 * truncating, a pair with insufficient overlap yields `null` and is reported,
 * and any name that cannot be correlated is dropped from the diversification
 * calculation with its share of portfolio weight stated.
 *
 * Effective bets are measured with HHI and the diversification ratio rather
 * than a principal-components decomposition: a symmetric eigensolver would be
 * roughly sixty lines of untested numerics with no linear-algebra dependency
 * available, and it answers the same question no better.
 */

export const DEFAULT_CORRELATION_WINDOW_DAYS = 252;
export const DEFAULT_MIN_OVERLAP_DAYS = 60;

export interface CorrelationExclusion {
  ticker: string;
  observations: number;
  reason: string;
}

export interface CorrelationMatrix {
  tickers: string[];
  /** Square matrix; null where the pair lacks sufficient overlap. */
  values: (number | null)[][];
  /** Shared observations behind each cell. */
  overlapDays: number[][];
  excluded: CorrelationExclusion[];
  windowFrom: string | null;
  windowTo: string | null;
  minOverlapDays: number;
}

export interface CorrelationOptions {
  minOverlapDays?: number;
}

/** Daily returns from a price series, restricted to a date window. */
export function dailyReturnsFromPrices(
  prices: MarketDataInput[],
  from: string,
  to: string
): DailyReturn[] {
  const sorted = [...prices]
    .sort((a, b) => a.date.localeCompare(b.date))
    .filter((p) => p.date >= from && p.date <= to);
  const out: DailyReturn[] = [];
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1].value;
    if (prev === 0) continue;
    out.push({ date: sorted[i].date, ret: sorted[i].value / prev - 1 });
  }
  return out;
}

/**
 * Builds returns for each ticker on a shared calendar, forward-filling within
 * the window but never inventing observations before a series begins.
 */
export function buildReturnsForWindow(
  priceHistory: Record<string, MarketDataInput[]>,
  tickers: string[],
  calendar: string[],
  from: string,
  to: string
): Record<string, DailyReturn[]> {
  const dates = calendar.filter((d) => d >= from && d <= to);
  const out: Record<string, DailyReturn[]> = {};

  for (const ticker of tickers) {
    const sorted = [...(priceHistory[ticker] ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    if (sorted.length === 0) {
      out[ticker] = [];
      continue;
    }
    const firstKnown = sorted[0].date;
    const returns: DailyReturn[] = [];
    let prev: number | null = null;
    for (const date of dates) {
      if (date < firstKnown) continue;
      const quote = forwardFillPriceDated(sorted, date);
      if (quote === null) continue;
      if (prev !== null && prev !== 0) {
        returns.push({ date, ret: quote.value / prev - 1 });
      }
      prev = quote.value;
    }
    out[ticker] = returns;
  }

  return out;
}

export function computeCorrelationMatrix(
  returnsByTicker: Record<string, DailyReturn[]>,
  options: CorrelationOptions = {}
): CorrelationMatrix {
  const minOverlapDays = options.minOverlapDays ?? DEFAULT_MIN_OVERLAP_DAYS;

  const excluded: CorrelationExclusion[] = [];
  const usable: string[] = [];
  for (const [ticker, returns] of Object.entries(returnsByTicker)) {
    if (returns.length < minOverlapDays) {
      excluded.push({
        ticker,
        observations: returns.length,
        reason: `only ${returns.length} observations, below the ${minOverlapDays}-day minimum`,
      });
      continue;
    }
    usable.push(ticker);
  }
  usable.sort();

  const byDate = new Map<string, Map<string, number>>();
  for (const ticker of usable) {
    const m = new Map<string, number>();
    for (const r of returnsByTicker[ticker]) m.set(r.date, r.ret);
    byDate.set(ticker, m);
  }

  const n = usable.length;
  const values: (number | null)[][] = Array.from({ length: n }, () =>
    Array<number | null>(n).fill(null)
  );
  const overlapDays: number[][] = Array.from({ length: n }, () =>
    Array<number>(n).fill(0)
  );

  for (let i = 0; i < n; i += 1) {
    values[i][i] = 1;
    overlapDays[i][i] = returnsByTicker[usable[i]].length;
    for (let j = i + 1; j < n; j += 1) {
      const a = byDate.get(usable[i])!;
      const b = byDate.get(usable[j])!;
      const xs: number[] = [];
      const ys: number[] = [];
      for (const [date, v] of a) {
        const other = b.get(date);
        if (other === undefined) continue;
        xs.push(v);
        ys.push(other);
      }
      const overlap = xs.length;
      overlapDays[i][j] = overlap;
      overlapDays[j][i] = overlap;
      const c = overlap >= minOverlapDays ? pearson(xs, ys) : null;
      values[i][j] = c;
      values[j][i] = c;
    }
  }

  const allDates = usable.flatMap((t) => returnsByTicker[t].map((r) => r.date)).sort();

  return {
    tickers: usable,
    values,
    overlapDays,
    excluded,
    windowFrom: allDates[0] ?? null,
    windowTo: allDates[allDates.length - 1] ?? null,
    minOverlapDays,
  };
}

export interface PairCorrelation {
  a: string;
  b: string;
  value: number;
  overlapDays: number;
}

export interface ConcentrationStats {
  /** Sum of squared weights. */
  hhi: number;
  /** 1 / HHI — the equal-weight equivalent number of positions. */
  effectiveNumberOfBets: number;
  /** (Σ wᵢσᵢ) / σ_portfolio. 1 means no diversification benefit at all. */
  diversificationRatio: number | null;
  /** Share of portfolio weight the ratio could actually be computed over. */
  coveredWeightPct: number;
  excludedFromRatio: string[];
  avgPairwiseCorrelation: number | null;
  mostCorrelatedPair: PairCorrelation | null;
  leastCorrelatedPair: PairCorrelation | null;
  topWeights: { ticker: string; weightPct: number }[];
}

/**
 * HHI, effective bet count and the diversification ratio.
 *
 * HHI uses every supplied weight. The diversification ratio can only use names
 * with a complete correlation row, so those weights are renormalized and the
 * covered share is reported — a ratio computed over 70% of the book should not
 * be read as though it covered all of it.
 */
export function computeConcentrationStats(
  weights: { ticker: string; weightPct: number }[],
  matrix: CorrelationMatrix,
  returnsByTicker: Record<string, DailyReturn[]>
): ConcentrationStats {
  const totalWeight = weights.reduce((a, w) => a + w.weightPct, 0);
  const hhi = weights.reduce(
    (a, w) => a + Math.pow(totalWeight === 0 ? 0 : w.weightPct / totalWeight, 2),
    0
  );

  const index = new Map(matrix.tickers.map((t, i) => [t, i]));
  const eligible = weights.filter((w) => {
    const i = index.get(w.ticker);
    if (i === undefined) return false;
    return matrix.values[i].every((v) => v !== null);
  });

  const excludedFromRatio = weights
    .filter((w) => !eligible.some((e) => e.ticker === w.ticker))
    .map((w) => w.ticker)
    .sort();

  const eligibleWeight = eligible.reduce((a, w) => a + w.weightPct, 0);
  const coveredWeightPct = totalWeight === 0 ? 0 : (eligibleWeight / totalWeight) * 100;

  let diversificationRatio: number | null = null;
  if (eligible.length > 0 && eligibleWeight > 0) {
    const vols = eligible.map((w) => {
      const sd = stdevSample(returnsByTicker[w.ticker].map((r) => r.ret));
      return sd === null ? 0 : sd * Math.sqrt(TRADING_DAYS_PER_YEAR);
    });
    const norm = eligible.map((w) => w.weightPct / eligibleWeight);

    let weightedVol = 0;
    for (let i = 0; i < eligible.length; i += 1) weightedVol += norm[i] * vols[i];

    let variance = 0;
    for (let i = 0; i < eligible.length; i += 1) {
      for (let j = 0; j < eligible.length; j += 1) {
        const ci = index.get(eligible[i].ticker)!;
        const cj = index.get(eligible[j].ticker)!;
        const corr = matrix.values[ci][cj] ?? 0;
        variance += norm[i] * norm[j] * vols[i] * vols[j] * corr;
      }
    }
    const portfolioVol = Math.sqrt(Math.max(0, variance));
    diversificationRatio = portfolioVol === 0 ? null : weightedVol / portfolioVol;
  }

  const pairs: PairCorrelation[] = [];
  for (let i = 0; i < matrix.tickers.length; i += 1) {
    for (let j = i + 1; j < matrix.tickers.length; j += 1) {
      const v = matrix.values[i][j];
      if (v === null) continue;
      pairs.push({
        a: matrix.tickers[i],
        b: matrix.tickers[j],
        value: v,
        overlapDays: matrix.overlapDays[i][j],
      });
    }
  }
  pairs.sort((a, b) => b.value - a.value);

  return {
    hhi,
    effectiveNumberOfBets: hhi === 0 ? 0 : 1 / hhi,
    diversificationRatio,
    coveredWeightPct,
    excludedFromRatio,
    avgPairwiseCorrelation:
      pairs.length === 0
        ? null
        : pairs.reduce((a, p) => a + p.value, 0) / pairs.length,
    mostCorrelatedPair: pairs[0] ?? null,
    leastCorrelatedPair: pairs[pairs.length - 1] ?? null,
    topWeights: [...weights]
      .sort((a, b) => b.weightPct - a.weightPct)
      .slice(0, 15)
      .map((w) => ({ ticker: w.ticker, weightPct: w.weightPct })),
  };
}
