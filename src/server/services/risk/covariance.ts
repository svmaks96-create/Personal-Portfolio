import { Matrix, EigenvalueDecomposition } from "ml-matrix";
import { TRADING_DAYS_PER_YEAR, type DailyReturn } from "@/server/services/risk-metrics";

/**
 * The shared covariance estimate every risk measurement consumes.
 *
 * Estimation choices, made deliberately:
 *
 * **Common sample.** The matrix is estimated on the dates where *every*
 * included name has a return — not pairwise — because marginal risk
 * contribution and the eigendecomposition behind the effective-bet count both
 * require one internally-consistent, positive semi-definite matrix. Pairwise
 * estimates use more data per pair but can produce a matrix that is not a
 * covariance matrix at all. The cost is that the youngest included name sets
 * the estimation window; `limitingTicker` and `observationCount` state this
 * rather than hiding it. Names with fewer than `minObservations` returns in
 * the window are excluded entirely and reported.
 *
 * **Ledoit-Wolf shrinkage** toward the constant-correlation target (Ledoit &
 * Wolf 2004, "Honey, I Shrunk the Sample Covariance Matrix"). Sample
 * covariance on ~20 names over ~250 days is noisy in exactly the way that
 * corrupts everything downstream: extreme sample correlations are the least
 * reliable ones, and they dominate risk decompositions. The shrinkage
 * intensity is estimated from the data (not a tuned knob) and reported.
 *
 * All matrices here are plain `number[][]` — daily returns are ordinary
 * floats well inside double precision; decimal.js is for ledger arithmetic,
 * not statistics.
 */

export const MIN_COVARIANCE_OBSERVATIONS = 60;

export interface CovarianceExclusion {
  ticker: string;
  observations: number;
  reason: string;
}

export interface CovarianceEstimate {
  /** Included names, sorted; row/column order of every matrix here. */
  tickers: string[];
  /** Annualized covariance, fraction² (0.09 ≈ (30% vol)²). */
  matrix: number[][];
  /** Shrunk correlation matrix implied by `matrix`. */
  correlation: number[][];
  /** Unshrunk sample correlation, for honesty about what shrinkage did. */
  sampleCorrelation: number[][];
  /** Annualized volatility per ticker, as a fraction. */
  vols: number[];
  /** Ledoit-Wolf shrinkage intensity in [0, 1]. */
  shrinkageIntensity: number;
  /** Average off-diagonal sample correlation (the shrinkage target level). */
  avgCorrelation: number;
  /** Shared trading days the estimate is computed on. */
  observationCount: number;
  windowFrom: string | null;
  windowTo: string | null;
  excluded: CovarianceExclusion[];
  /** Included name with the fewest observations — what caps the window. */
  limitingTicker: string | null;
  /** True if eigenvalue clipping was needed to restore PSD (should be rare). */
  psdRepaired: boolean;
}

interface CommonSample {
  tickers: string[];
  dates: string[];
  /** returns[t][i] = return of tickers[i] on dates[t]. */
  returns: number[][];
  excluded: CovarianceExclusion[];
}

/**
 * Intersects return series onto their shared dates. If the intersection falls
 * below `minObservations`, the shortest series is dropped (reported) and the
 * intersection recomputed — a name whose history barely overlaps the rest
 * should not be allowed to erase the sample for everyone else.
 */
export function buildCommonSample(
  returnsByTicker: Record<string, DailyReturn[]>,
  minObservations: number = MIN_COVARIANCE_OBSERVATIONS
): CommonSample {
  const excluded: CovarianceExclusion[] = [];
  const candidates = new Map<string, Map<string, number>>();

  for (const [ticker, returns] of Object.entries(returnsByTicker)) {
    if (returns.length < minObservations) {
      excluded.push({
        ticker,
        observations: returns.length,
        reason: `only ${returns.length} observations, below the ${minObservations}-day minimum`,
      });
      continue;
    }
    candidates.set(ticker, new Map(returns.map((r) => [r.date, r.ret])));
  }

  for (;;) {
    const tickers = [...candidates.keys()].sort();
    if (tickers.length === 0) {
      return { tickers: [], dates: [], returns: [], excluded };
    }

    let shared: string[] | null = null;
    for (const ticker of tickers) {
      const dates = candidates.get(ticker)!;
      shared =
        shared === null
          ? [...dates.keys()]
          : shared.filter((d) => dates.has(d));
    }
    const dates = (shared ?? []).sort();

    if (dates.length >= minObservations || tickers.length === 1) {
      if (dates.length < minObservations) {
        // Even alone the last name cannot form a sample — exclude it too.
        const ticker = tickers[0];
        excluded.push({
          ticker,
          observations: dates.length,
          reason: `only ${dates.length} shared observations, below the ${minObservations}-day minimum`,
        });
        return { tickers: [], dates: [], returns: [], excluded };
      }
      const returns = dates.map((d) =>
        tickers.map((t) => candidates.get(t)!.get(d)!)
      );
      return { tickers, dates, returns, excluded };
    }

    // Drop the series with the fewest observations and retry.
    let shortest = tickers[0];
    for (const ticker of tickers) {
      if (candidates.get(ticker)!.size < candidates.get(shortest)!.size) {
        shortest = ticker;
      }
    }
    excluded.push({
      ticker: shortest,
      observations: candidates.get(shortest)!.size,
      reason: `overlap with the rest of the book is under ${minObservations} shared days`,
    });
    candidates.delete(shortest);
  }
}

interface ShrinkageResult {
  /** Daily-scale shrunk covariance. */
  sigma: number[][];
  /** Daily-scale sample covariance. */
  sample: number[][];
  intensity: number;
  avgCorrelation: number;
}

/**
 * Ledoit-Wolf (2004) shrinkage of the sample covariance toward the
 * constant-correlation target. `returns[t][i]` — observations by assets.
 * Covariances use the 1/T convention the estimator is derived under.
 */
export function ledoitWolfShrinkage(returns: number[][]): ShrinkageResult {
  const T = returns.length;
  const N = returns[0]?.length ?? 0;
  if (T < 2 || N === 0) {
    throw new Error(`ledoitWolfShrinkage needs T>=2 observations, got ${T}`);
  }

  const means = new Array<number>(N).fill(0);
  for (const row of returns) for (let i = 0; i < N; i++) means[i] += row[i];
  for (let i = 0; i < N; i++) means[i] /= T;

  // Demeaned observations.
  const x: number[][] = returns.map((row) => row.map((v, i) => v - means[i]));

  // Sample covariance S (1/T).
  const s: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      const xi = x[t][i];
      for (let j = i; j < N; j++) {
        s[i][j] += xi * x[t][j];
      }
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      s[i][j] /= T;
      s[j][i] = s[i][j];
    }
  }

  // Average sample correlation r̄.
  let corrSum = 0;
  let corrCount = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      const denom = Math.sqrt(s[i][i] * s[j][j]);
      if (denom > 0) {
        corrSum += s[i][j] / denom;
        corrCount++;
      }
    }
  }
  const rBar = corrCount === 0 ? 0 : corrSum / corrCount;

  // Constant-correlation target F.
  const f: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from({ length: N }, (_, j) =>
      i === j ? s[i][i] : rBar * Math.sqrt(s[i][i] * s[j][j])
    )
  );

  // π̂ — sum of asymptotic variances of the sample covariances.
  // θ̂ terms feed ρ̂, the covariance between estimation errors of S and F.
  let piHat = 0;
  let rhoHat = 0;
  let gammaHat = 0;

  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      let pi_ij = 0;
      for (let t = 0; t < T; t++) {
        const d = x[t][i] * x[t][j] - s[i][j];
        pi_ij += d * d;
      }
      pi_ij /= T;
      piHat += pi_ij;

      if (i === j) {
        rhoHat += pi_ij;
      } else {
        let thetaII = 0;
        let thetaJJ = 0;
        for (let t = 0; t < T; t++) {
          const dij = x[t][i] * x[t][j] - s[i][j];
          thetaII += (x[t][i] * x[t][i] - s[i][i]) * dij;
          thetaJJ += (x[t][j] * x[t][j] - s[j][j]) * dij;
        }
        thetaII /= T;
        thetaJJ /= T;
        const sii = s[i][i];
        const sjj = s[j][j];
        if (sii > 0 && sjj > 0) {
          rhoHat +=
            (rBar / 2) *
            (Math.sqrt(sjj / sii) * thetaII + Math.sqrt(sii / sjj) * thetaJJ);
        }
      }

      const diff = f[i][j] - s[i][j];
      gammaHat += diff * diff;
    }
  }

  const kappa = gammaHat === 0 ? 0 : (piHat - rhoHat) / gammaHat;
  const intensity = Math.max(0, Math.min(1, kappa / T));

  const sigma: number[][] = Array.from({ length: N }, (_, i) =>
    Array.from(
      { length: N },
      (_, j) => intensity * f[i][j] + (1 - intensity) * s[i][j]
    )
  );

  return { sigma, sample: s, intensity, avgCorrelation: rBar };
}

/** Correlation matrix implied by a covariance matrix. */
function toCorrelation(cov: number[][]): number[][] {
  const n = cov.length;
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => {
      if (i === j) return 1;
      const denom = Math.sqrt(cov[i][i] * cov[j][j]);
      return denom === 0 ? 0 : cov[i][j] / denom;
    })
  );
}

/**
 * Clips negative eigenvalues to zero and reconstructs. With shrinkage applied
 * this should essentially never fire; it exists so a numerically-degenerate
 * matrix cannot reach the risk decomposition unrepaired and unreported.
 */
function ensurePsd(cov: number[][]): { matrix: number[][]; repaired: boolean } {
  const eig = new EigenvalueDecomposition(new Matrix(cov), {
    assumeSymmetric: true,
  });
  const values = eig.realEigenvalues;
  const minEig = Math.min(...values);
  if (minEig >= 0) return { matrix: cov, repaired: false };

  const v = eig.eigenvectorMatrix;
  const clipped = Matrix.diag(values.map((e) => Math.max(0, e)));
  const rebuilt = v.mmul(clipped).mmul(v.transpose());
  return { matrix: rebuilt.to2DArray(), repaired: true };
}

/**
 * The one entry point: shared-calendar returns in, annualized shrunk
 * covariance out, with every estimation caveat carried alongside.
 */
export function estimateCovariance(
  returnsByTicker: Record<string, DailyReturn[]>,
  minObservations: number = MIN_COVARIANCE_OBSERVATIONS
): CovarianceEstimate | null {
  const sample = buildCommonSample(returnsByTicker, minObservations);
  if (sample.tickers.length === 0) return null;

  const { sigma, sample: sampleCov, intensity, avgCorrelation } =
    ledoitWolfShrinkage(sample.returns);

  const annualized = sigma.map((row) =>
    row.map((v) => v * TRADING_DAYS_PER_YEAR)
  );
  const { matrix, repaired } = ensurePsd(annualized);

  let limitingTicker: string | null = null;
  let fewest = Infinity;
  for (const ticker of sample.tickers) {
    const count = returnsByTicker[ticker].length;
    if (count < fewest) {
      fewest = count;
      limitingTicker = ticker;
    }
  }

  return {
    tickers: sample.tickers,
    matrix,
    correlation: toCorrelation(matrix),
    sampleCorrelation: toCorrelation(sampleCov),
    vols: matrix.map((row, i) => Math.sqrt(Math.max(0, row[i]))),
    shrinkageIntensity: intensity,
    avgCorrelation,
    observationCount: sample.dates.length,
    windowFrom: sample.dates[0] ?? null,
    windowTo: sample.dates[sample.dates.length - 1] ?? null,
    excluded: sample.excluded,
    limitingTicker,
    psdRepaired: repaired,
  };
}
