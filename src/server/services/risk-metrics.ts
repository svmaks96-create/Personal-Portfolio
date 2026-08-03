import { differenceInDays, parseISO } from "date-fns";
import {
  excessKurtosis,
  mean,
  ols,
  quantile,
  skewness,
  stdevSample,
} from "@/server/services/series-utils";

/**
 * Risk statistics derived from a daily growth-of-a-dollar series.
 *
 * Everything here consumes the *corrected* portfolio series — the one built
 * from the per-account daily walk — rather than the app's chart engine, which
 * drops trades made on non-trading days.
 *
 * Two deliberate choices worth knowing about:
 *
 * The risk-free rate defaults to **zero**, and every Sharpe/Sortino figure is
 * labelled as excess over 0% cash. The database holds no rate data, and the
 * window spans roughly 0% to 5%+ policy rates, so any single constant would be
 * wrong for most of it. A flag exists for anyone who wants to assume one.
 *
 * Rather than gating on a minimum portfolio value — which would erase 2021
 * entirely, when the book was a few thousand dollars — outsized daily moves are
 * *reported* and a parallel `robust` block excludes them. If the two blocks
 * disagree materially, the headline number should not be trusted.
 */

export const TRADING_DAYS_PER_YEAR = 252;
/** Daily moves beyond this are surfaced for inspection. */
export const ANOMALOUS_RETURN_THRESHOLD = 0.1;
/** Daily moves beyond this are dropped from the `robust` block. */
export const ROBUST_RETURN_THRESHOLD = 0.25;

export interface GrowthPoint {
  date: string;
  growthOfDollar: number;
  marketValueUsd?: number;
}

export interface DailyReturn {
  date: string;
  ret: number;
}

/** Daily returns from a chain-linked growth series. */
export function dailyReturnsFromGrowth(series: GrowthPoint[]): DailyReturn[] {
  const out: DailyReturn[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const prev = series[i - 1].growthOfDollar;
    if (prev === 0) continue;
    out.push({ date: series[i].date, ret: series[i].growthOfDollar / prev - 1 });
  }
  return out;
}

export interface DrawdownEpisode {
  peakDate: string;
  peakValue: number;
  troughDate: string;
  troughValue: number;
  depthPct: number;
  recoveryDate: string | null;
  /** Peak to trough. */
  drawdownDays: number;
  /** Trough back to the prior peak; null while still under water. */
  recoveryDays: number | null;
  isRecovered: boolean;
}

export interface DrawdownAnalysis {
  maxDrawdownPct: number | null;
  currentDrawdownPct: number | null;
  episodes: DrawdownEpisode[];
  longestUnderwaterDays: number | null;
}

/**
 * Non-overlapping drawdown episodes. A new all-time high closes the current
 * episode; anything still under water at the end is reported unrecovered
 * rather than silently dropped.
 */
export function computeDrawdowns(
  series: GrowthPoint[],
  topN = 10
): DrawdownAnalysis {
  if (series.length === 0) {
    return {
      maxDrawdownPct: null,
      currentDrawdownPct: null,
      episodes: [],
      longestUnderwaterDays: null,
    };
  }

  const episodes: DrawdownEpisode[] = [];
  let peakValue = series[0].growthOfDollar;
  let peakDate = series[0].date;
  let troughValue = peakValue;
  let troughDate = peakDate;
  let inDrawdown = false;

  const close = (recoveryDate: string | null) => {
    if (!inDrawdown || peakValue <= 0) return;
    episodes.push({
      peakDate,
      peakValue,
      troughDate,
      troughValue,
      depthPct: (troughValue / peakValue - 1) * 100,
      recoveryDate,
      drawdownDays: differenceInDays(parseISO(troughDate), parseISO(peakDate)),
      recoveryDays:
        recoveryDate === null
          ? null
          : differenceInDays(parseISO(recoveryDate), parseISO(troughDate)),
      isRecovered: recoveryDate !== null,
    });
    inDrawdown = false;
  };

  for (const point of series) {
    const v = point.growthOfDollar;
    if (v >= peakValue) {
      close(point.date);
      peakValue = v;
      peakDate = point.date;
      troughValue = v;
      troughDate = point.date;
    } else {
      if (!inDrawdown) {
        inDrawdown = true;
        troughValue = v;
        troughDate = point.date;
      } else if (v < troughValue) {
        troughValue = v;
        troughDate = point.date;
      }
    }
  }
  close(null);

  const last = series[series.length - 1].growthOfDollar;
  const runningPeak = series.reduce((a, p) => Math.max(a, p.growthOfDollar), 0);

  const ranked = [...episodes].sort((a, b) => a.depthPct - b.depthPct).slice(0, topN);
  const underwater = episodes.map((e) =>
    e.recoveryDate === null
      ? differenceInDays(
          parseISO(series[series.length - 1].date),
          parseISO(e.peakDate)
        )
      : differenceInDays(parseISO(e.recoveryDate), parseISO(e.peakDate))
  );

  return {
    maxDrawdownPct: ranked.length > 0 ? ranked[0].depthPct : null,
    currentDrawdownPct: runningPeak > 0 ? (last / runningPeak - 1) * 100 : null,
    episodes: ranked,
    longestUnderwaterDays: underwater.length > 0 ? Math.max(...underwater) : null,
  };
}

export interface RiskStats {
  n: number;
  from: string | null;
  to: string | null;
  cumulativeReturnPct: number | null;
  annualizedReturnPct: number | null;
  annualizedVolPct: number | null;
  /** Labelled explicitly because the risk-free assumption is a choice. */
  riskFreeAnnualPct: number;
  sharpe: number | null;
  sortino: number | null;
  calmar: number | null;
  maxDrawdownPct: number | null;
  skewness: number | null;
  excessKurtosis: number | null;
  bestDayPct: number | null;
  worstDayPct: number | null;
  positiveDaysPct: number | null;
  var95Pct: number | null;
  cvar95Pct: number | null;
}

export function computeRiskStats(
  series: GrowthPoint[],
  riskFreeAnnualPct = 0
): RiskStats {
  const returns = dailyReturnsFromGrowth(series);
  const values = returns.map((r) => r.ret);

  const empty: RiskStats = {
    n: values.length,
    from: series[0]?.date ?? null,
    to: series[series.length - 1]?.date ?? null,
    cumulativeReturnPct: null,
    annualizedReturnPct: null,
    annualizedVolPct: null,
    riskFreeAnnualPct,
    sharpe: null,
    sortino: null,
    calmar: null,
    maxDrawdownPct: null,
    skewness: null,
    excessKurtosis: null,
    bestDayPct: null,
    worstDayPct: null,
    positiveDaysPct: null,
    var95Pct: null,
    cvar95Pct: null,
  };
  if (values.length < 2 || series.length < 2) return empty;

  const start = series[0].growthOfDollar;
  const end = series[series.length - 1].growthOfDollar;
  const cumulative = start === 0 ? null : end / start - 1;

  const days = differenceInDays(
    parseISO(series[series.length - 1].date),
    parseISO(series[0].date)
  );
  const annualizedReturn =
    cumulative === null || 1 + cumulative <= 0 || days <= 0
      ? null
      : Math.pow(1 + cumulative, 365.25 / days) - 1;

  const sd = stdevSample(values);
  const vol = sd === null ? null : sd * Math.sqrt(TRADING_DAYS_PER_YEAR);

  const rfDaily = riskFreeAnnualPct / 100 / TRADING_DAYS_PER_YEAR;
  const excess = values.map((v) => v - rfDaily);
  const excessMean = mean(excess);

  const sharpe =
    sd === null || sd === 0 || excessMean === null
      ? null
      : (excessMean / sd) * Math.sqrt(TRADING_DAYS_PER_YEAR);

  // Sortino uses the full-sample denominator (downside deviation over n, not
  // over the count of downside days) — stated because both conventions exist.
  const downside = excess.filter((v) => v < 0);
  let sortino: number | null = null;
  if (downside.length > 0 && excessMean !== null) {
    let acc = 0;
    for (const v of downside) acc += v * v;
    const dd = Math.sqrt(acc / excess.length);
    sortino = dd === 0 ? null : (excessMean / dd) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  }

  const drawdowns = computeDrawdowns(series, 1);
  const maxDd = drawdowns.maxDrawdownPct;

  const sorted = [...values].sort((a, b) => a - b);
  const var95 = quantile(sorted, 0.05);
  const tail = sorted.filter((v) => var95 !== null && v <= var95);

  return {
    n: values.length,
    from: series[0].date,
    to: series[series.length - 1].date,
    cumulativeReturnPct: cumulative === null ? null : cumulative * 100,
    annualizedReturnPct: annualizedReturn === null ? null : annualizedReturn * 100,
    annualizedVolPct: vol === null ? null : vol * 100,
    riskFreeAnnualPct,
    sharpe,
    sortino,
    calmar:
      annualizedReturn === null || maxDd === null || maxDd === 0
        ? null
        : (annualizedReturn * 100) / Math.abs(maxDd),
    maxDrawdownPct: maxDd,
    skewness: skewness(values),
    excessKurtosis: excessKurtosis(values),
    bestDayPct: Math.max(...values) * 100,
    worstDayPct: Math.min(...values) * 100,
    positiveDaysPct: (values.filter((v) => v > 0).length / values.length) * 100,
    var95Pct: var95 === null ? null : var95 * 100,
    cvar95Pct: tail.length === 0 ? null : (mean(tail) ?? 0) * 100,
  };
}

export interface BenchmarkRelation {
  symbol: string;
  n: number;
  beta: number | null;
  /** Annualized intercept — the part not explained by the benchmark. */
  alphaAnnualizedPct: number | null;
  correlation: number | null;
  r2: number | null;
  trackingErrorPct: number | null;
  informationRatio: number | null;
  upCapturePct: number | null;
  downCapturePct: number | null;
}

/**
 * Regresses portfolio returns on a benchmark over their shared dates.
 * "Was the drawdown just beta?" is unanswerable without this.
 */
export function computeBenchmarkRelation(
  symbol: string,
  portfolio: GrowthPoint[],
  benchmark: GrowthPoint[]
): BenchmarkRelation {
  const p = new Map(dailyReturnsFromGrowth(portfolio).map((r) => [r.date, r.ret]));
  const b = new Map(dailyReturnsFromGrowth(benchmark).map((r) => [r.date, r.ret]));

  const py: number[] = [];
  const bx: number[] = [];
  for (const [date, ret] of p) {
    const other = b.get(date);
    if (other === undefined) continue;
    py.push(ret);
    bx.push(other);
  }

  const empty: BenchmarkRelation = {
    symbol,
    n: py.length,
    beta: null,
    alphaAnnualizedPct: null,
    correlation: null,
    r2: null,
    trackingErrorPct: null,
    informationRatio: null,
    upCapturePct: null,
    downCapturePct: null,
  };
  if (py.length < 2) return empty;

  const fit = ols(py, bx);
  const diff = py.map((v, i) => v - bx[i]);
  const teDaily = stdevSample(diff);
  const te = teDaily === null ? null : teDaily * Math.sqrt(TRADING_DAYS_PER_YEAR);
  const meanDiff = mean(diff);

  const upIdx = bx.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  const downIdx = bx.map((v, i) => (v < 0 ? i : -1)).filter((i) => i >= 0);
  const capture = (idx: number[]): number | null => {
    if (idx.length === 0) return null;
    const mp = mean(idx.map((i) => py[i]));
    const mb = mean(idx.map((i) => bx[i]));
    if (mp === null || mb === null || mb === 0) return null;
    return (mp / mb) * 100;
  };

  return {
    symbol,
    n: py.length,
    beta: fit?.beta ?? null,
    alphaAnnualizedPct:
      fit === null ? null : fit.alpha * TRADING_DAYS_PER_YEAR * 100,
    correlation: fit?.correlation ?? null,
    r2: fit?.r2 ?? null,
    trackingErrorPct: te === null ? null : te * 100,
    informationRatio:
      te === null || te === 0 || meanDiff === null
        ? null
        : (meanDiff * TRADING_DAYS_PER_YEAR) / te,
    upCapturePct: capture(upIdx),
    downCapturePct: capture(downIdx),
  };
}

export interface RollingPoint {
  date: string;
  value: number;
}

/** Trailing annualized volatility over a rolling window of trading days. */
export function rollingVolatility(
  series: GrowthPoint[],
  window = 90
): RollingPoint[] {
  const returns = dailyReturnsFromGrowth(series);
  const out: RollingPoint[] = [];
  for (let i = window - 1; i < returns.length; i += 1) {
    const slice = returns.slice(i - window + 1, i + 1).map((r) => r.ret);
    const sd = stdevSample(slice);
    if (sd === null) continue;
    out.push({
      date: returns[i].date,
      value: sd * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100,
    });
  }
  return out;
}

export interface AnomalousDay {
  date: string;
  retPct: number;
  marketValueUsd: number | null;
}

export function findAnomalousDays(
  series: GrowthPoint[],
  threshold = ANOMALOUS_RETURN_THRESHOLD
): AnomalousDay[] {
  const mvByDate = new Map(series.map((p) => [p.date, p.marketValueUsd ?? null]));
  return dailyReturnsFromGrowth(series)
    .filter((r) => Math.abs(r.ret) > threshold)
    .map((r) => ({
      date: r.date,
      retPct: r.ret * 100,
      marketValueUsd: mvByDate.get(r.date) ?? null,
    }));
}

/**
 * Re-runs the stat block with extreme days removed. On a book that started at a
 * few thousand dollars, a single odd day can dominate the volatility figure;
 * if headline and robust disagree, neither should be quoted without the other.
 */
export function computeRobustRiskStats(
  series: GrowthPoint[],
  riskFreeAnnualPct = 0,
  threshold = ROBUST_RETURN_THRESHOLD
): RiskStats {
  const returns = dailyReturnsFromGrowth(series);
  const kept: GrowthPoint[] = series.length > 0 ? [series[0]] : [];
  let growth = series[0]?.growthOfDollar ?? 1;
  for (const r of returns) {
    if (Math.abs(r.ret) > threshold) continue;
    growth *= 1 + r.ret;
    kept.push({ date: r.date, growthOfDollar: growth });
  }
  return computeRiskStats(kept, riskFreeAnnualPct);
}

export interface RegimeWindow {
  label: string;
  from: string;
  to: string;
}

export interface RegimeRiskSlice {
  label: string;
  portfolio: RiskStats;
  benchmarks: BenchmarkRelation[];
  benchmarkStats: RiskStats[];
}

export function sliceGrowth(
  series: GrowthPoint[],
  from: string,
  to: string
): GrowthPoint[] {
  const inWindow = series.filter((p) => p.date >= from && p.date <= to);
  if (inWindow.length === 0) return [];
  const before = series.filter((p) => p.date < from);
  const anchor =
    before.length > 0 ? before[before.length - 1] : inWindow[0];
  const base = anchor.growthOfDollar;
  if (base === 0) return inWindow;
  return [anchor, ...inWindow].map((p) => ({
    ...p,
    growthOfDollar: p.growthOfDollar / base,
  }));
}

export function computeRegimeSlices(
  windows: RegimeWindow[],
  portfolio: GrowthPoint[],
  benchmarks: Record<string, GrowthPoint[]>,
  riskFreeAnnualPct = 0
): RegimeRiskSlice[] {
  return windows.map((w) => {
    const p = sliceGrowth(portfolio, w.from, w.to);
    const relations: BenchmarkRelation[] = [];
    const stats: RiskStats[] = [];
    for (const [symbol, series] of Object.entries(benchmarks)) {
      const b = sliceGrowth(series, w.from, w.to);
      relations.push(computeBenchmarkRelation(symbol, p, b));
      stats.push(computeRiskStats(b, riskFreeAnnualPct));
    }
    return {
      label: w.label,
      portfolio: computeRiskStats(p, riskFreeAnnualPct),
      benchmarks: relations,
      benchmarkStats: stats,
    };
  });
}
