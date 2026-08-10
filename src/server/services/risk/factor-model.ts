import { Matrix, solve, inverse } from "ml-matrix";
import { TRADING_DAYS_PER_YEAR, type DailyReturn } from "@/server/services/risk-metrics";

/**
 * Factor decomposition against tradeable proxies: how much of the book's
 * return was replicable with cheap ETFs, and whether the leftover is
 * distinguishable from noise.
 *
 * The collinearity trap (QQQ/SOXX/IGV are ~one factor) is handled by
 * **sequential orthogonalization with a declared ordering**: SPY first, then
 * SOXX stripped of its SPY exposure, then IGV stripped of both, then TLT
 * stripped of all three. Each beta reads as an *incremental* tilt — "semis
 * beyond the market" — and because the regressors are mutually orthogonal
 * the R² decomposition is exact and order-stable. QQQ is dropped outright:
 * it is close to a linear combination of the others and is the main
 * offender. Ridge was rejected because its penalty is an unexplainable knob.
 *
 * Alpha inference uses Newey-West (HAC) standard errors — daily financial
 * returns are autocorrelated enough that plain OLS errors overstate
 * confidence. The verdict ("not distinguishable from zero") is computed
 * here, in words, rather than left for the reader to infer from a t-stat.
 */

export interface FactorSpec {
  symbol: string;
  /** Plain-language reading of the orthogonalized factor. */
  label: string;
}

export const FACTOR_SPECS: readonly FactorSpec[] = [
  { symbol: "SPY", label: "Market (SPY)" },
  { symbol: "SOXX", label: "Semis beyond market (SOXX⊥)" },
  { symbol: "IGV", label: "Software beyond market (IGV⊥)" },
  { symbol: "TLT", label: "Rates / duration (TLT⊥)" },
] as const;

export const MIN_FACTOR_OBSERVATIONS = 60;

export interface FactorLoading {
  symbol: string;
  label: string;
  /** Beta on the orthogonalized factor. */
  beta: number;
  seBeta: number;
  tStat: number;
  /** Share of portfolio variance this factor explains, pct. */
  varianceSharePct: number;
}

export interface FactorDrift {
  symbol: string;
  label: string;
  firstHalfBeta: number | null;
  secondHalfBeta: number | null;
}

export interface FactorModel {
  observations: number;
  from: string;
  to: string;
  /** Total variance explained by the proxies, pct. */
  r2Pct: number;
  loadings: FactorLoading[];
  /** Annualized alpha, pct. */
  alphaAnnualPct: number;
  alphaSeAnnualPct: number;
  alphaTStat: number;
  alphaCiLowPct: number;
  alphaCiHighPct: number;
  /** |t| ≥ 1.96 under HAC errors. */
  alphaDistinguishable: boolean;
  neweyWestLags: number;
  drift: FactorDrift[];
}

interface AlignedSample {
  dates: string[];
  y: number[];
  /** factors[k][t], ordered as FACTOR_SPECS. */
  factors: number[][];
}

function alignSample(
  portfolioReturns: DailyReturn[],
  factorReturns: Record<string, DailyReturn[]>
): AlignedSample {
  const factorMaps = FACTOR_SPECS.map(
    (spec) => new Map((factorReturns[spec.symbol] ?? []).map((r) => [r.date, r.ret]))
  );
  const dates: string[] = [];
  const y: number[] = [];
  const factors: number[][] = FACTOR_SPECS.map(() => []);

  for (const point of portfolioReturns) {
    if (factorMaps.some((m) => !m.has(point.date))) continue;
    dates.push(point.date);
    y.push(point.ret);
    factorMaps.forEach((m, k) => factors[k].push(m.get(point.date)!));
  }
  return { dates, y, factors };
}

/** Residual of `series` regressed (with intercept) on prior orthogonal columns. */
function residualize(series: number[], priors: number[][]): number[] {
  const t = series.length;
  const mean = series.reduce((a, v) => a + v, 0) / t;
  let residual = series.map((v) => v - mean);
  for (const prior of priors) {
    const priorMean = prior.reduce((a, v) => a + v, 0) / t;
    const centered = prior.map((v) => v - priorMean);
    let num = 0;
    let den = 0;
    for (let i = 0; i < t; i++) {
      num += residual[i] * centered[i];
      den += centered[i] * centered[i];
    }
    if (den === 0) continue;
    const coefficient = num / den;
    residual = residual.map((v, i) => v - coefficient * centered[i]);
  }
  return residual;
}

/**
 * Orthogonalized design: column 0 is raw SPY, later columns are residuals of
 * each proxy on everything before it. Residuals are mean-zero by
 * construction; SPY keeps its mean (the intercept absorbs it).
 */
function orthogonalize(factors: number[][]): number[][] {
  const columns: number[][] = [factors[0]];
  for (let k = 1; k < factors.length; k++) {
    columns.push(residualize(factors[k], columns));
  }
  return columns;
}

function neweyWestLagCount(t: number): number {
  return Math.max(1, Math.floor(4 * Math.pow(t / 100, 2 / 9)));
}

interface RegressionResult {
  /** [alpha, beta_0..beta_K-1] */
  coefficients: number[];
  /** HAC standard errors, same order. */
  standardErrors: number[];
  r2: number;
  lags: number;
}

function hacRegression(y: number[], columns: number[][]): RegressionResult {
  const t = y.length;
  const k = columns.length + 1;

  const xData = Array.from({ length: t }, (_, i) => [
    1,
    ...columns.map((c) => c[i]),
  ]);
  const x = new Matrix(xData);
  const yMat = Matrix.columnVector(y);
  const betaMat = solve(x, yMat, true);
  const coefficients = betaMat.getColumn(0);

  const fitted = x.mmul(betaMat).getColumn(0);
  const residuals = y.map((v, i) => v - fitted[i]);

  const yMean = y.reduce((a, v) => a + v, 0) / t;
  const totalSs = y.reduce((a, v) => a + (v - yMean) * (v - yMean), 0);
  const residSs = residuals.reduce((a, e) => a + e * e, 0);
  const r2 = totalSs === 0 ? 0 : 1 - residSs / totalSs;

  // Newey-West covariance: (X'X)⁻¹ · S · (X'X)⁻¹ with Bartlett weights.
  const xtxInv = inverse(x.transpose().mmul(x));
  const lags = neweyWestLagCount(t);
  const s = Matrix.zeros(k, k);
  for (let lag = 0; lag <= lags; lag++) {
    const weight = lag === 0 ? 1 : 1 - lag / (lags + 1);
    for (let i = lag; i < t; i++) {
      const scale = weight * residuals[i] * residuals[i - lag];
      for (let a = 0; a < k; a++) {
        for (let b = 0; b < k; b++) {
          const term = scale * xData[i][a] * xData[i - lag][b];
          s.set(a, b, s.get(a, b) + term + (lag > 0 ? scale * xData[i - lag][a] * xData[i][b] : 0));
        }
      }
    }
  }
  const cov = xtxInv.mmul(s).mmul(xtxInv);
  const standardErrors = Array.from({ length: k }, (_, i) =>
    Math.sqrt(Math.max(0, cov.get(i, i)))
  );

  return { coefficients, standardErrors, r2, lags };
}

function variance(series: number[]): number {
  const t = series.length;
  const mean = series.reduce((a, v) => a + v, 0) / t;
  return series.reduce((a, v) => a + (v - mean) * (v - mean), 0) / t;
}

/** Betas only, for the drift halves. */
function betasFor(y: number[], factors: number[][]): number[] | null {
  if (y.length < MIN_FACTOR_OBSERVATIONS) return null;
  const columns = orthogonalize(factors);
  const { coefficients } = hacRegression(y, columns);
  return coefficients.slice(1);
}

export function computeFactorModel(
  portfolioReturns: DailyReturn[],
  factorReturns: Record<string, DailyReturn[]>
): FactorModel | null {
  const sample = alignSample(portfolioReturns, factorReturns);
  const t = sample.dates.length;
  if (t < MIN_FACTOR_OBSERVATIONS) return null;

  const columns = orthogonalize(sample.factors);
  const { coefficients, standardErrors, r2, lags } = hacRegression(
    sample.y,
    columns
  );

  const yVariance = variance(sample.y);
  const loadings: FactorLoading[] = FACTOR_SPECS.map((spec, k) => {
    const beta = coefficients[k + 1];
    const se = standardErrors[k + 1];
    return {
      symbol: spec.symbol,
      label: spec.label,
      beta,
      seBeta: se,
      tStat: se === 0 ? 0 : beta / se,
      varianceSharePct:
        yVariance === 0 ? 0 : ((beta * beta * variance(columns[k])) / yVariance) * 100,
    };
  });

  const annualize = TRADING_DAYS_PER_YEAR * 100;
  const alphaAnnualPct = coefficients[0] * annualize;
  const alphaSeAnnualPct = standardErrors[0] * annualize;
  const alphaTStat =
    standardErrors[0] === 0 ? 0 : coefficients[0] / standardErrors[0];

  const half = Math.floor(t / 2);
  const firstBetas = betasFor(
    sample.y.slice(0, half),
    sample.factors.map((f) => f.slice(0, half))
  );
  const secondBetas = betasFor(
    sample.y.slice(half),
    sample.factors.map((f) => f.slice(half))
  );
  const drift: FactorDrift[] = FACTOR_SPECS.map((spec, k) => ({
    symbol: spec.symbol,
    label: spec.label,
    firstHalfBeta: firstBetas?.[k] ?? null,
    secondHalfBeta: secondBetas?.[k] ?? null,
  }));

  return {
    observations: t,
    from: sample.dates[0],
    to: sample.dates[t - 1],
    r2Pct: Math.max(0, r2) * 100,
    loadings,
    alphaAnnualPct,
    alphaSeAnnualPct,
    alphaTStat,
    alphaCiLowPct: alphaAnnualPct - 1.96 * alphaSeAnnualPct,
    alphaCiHighPct: alphaAnnualPct + 1.96 * alphaSeAnnualPct,
    alphaDistinguishable: Math.abs(alphaTStat) >= 1.96,
    neweyWestLags: lags,
    drift,
  };
}
