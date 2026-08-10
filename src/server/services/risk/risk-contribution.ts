import type { CovarianceEstimate } from "@/server/services/risk/covariance";
import type { UniverseWeight } from "@/server/services/risk/weights";

/**
 * Marginal contribution to risk: what the next dollar into each name does to
 * portfolio volatility, and what share of today's volatility each name is
 * responsible for.
 *
 * All decomposition maths runs on the names the covariance estimate actually
 * covers. Universe members without a covariance row (short history) cannot be
 * decomposed — they are listed, their weight share is reported, and the
 * covered weights are renormalized, following the same honesty convention as
 * the correlation module.
 *
 * Equal-risk-contribution weights are computed as a *reference point only*
 * (the page must present them that way): cyclical coordinate descent — for
 * each name solve the quadratic σ_ii·x² + b·x − σ²(x)/n = 0 holding the
 * others fixed, i.e. set that name's variance contribution to its equal
 * share, and sweep until the system is self-consistent.
 */

export const WHAT_IF_ADD_USD = 10_000;

export interface RiskContributionRow {
  ticker: string;
  /** Capital weight within the covered set, pct (sums to 100). */
  weightPct: number;
  /** Share of portfolio variance, pct (sums to 100). */
  riskContributionPct: number;
  /** Weight a perfectly risk-balanced book would give this name, pct. */
  ercWeightPct: number;
  /** Standalone annualized volatility, pct. */
  standaloneVolPct: number;
  /** Change in portfolio vol (pct points) if WHAT_IF_ADD_USD is added. */
  addWhatIfVolDeltaPct: number | null;
}

export interface RiskContribution {
  /** Annualized portfolio volatility under current weights, pct. */
  portfolioVolPct: number;
  rows: RiskContributionRow[];
  /** Share of universe weight the decomposition covers, pct. */
  coveredWeightPct: number;
  excludedTickers: string[];
  /** Dollar base used for the what-if — the covered names' market value. */
  coveredMarketValueUsd: number;
}

function portfolioVariance(cov: number[][], w: number[]): number {
  let variance = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      variance += w[i] * cov[i][j] * w[j];
    }
  }
  return Math.max(0, variance);
}

/**
 * ERC weights for a PSD covariance matrix, summing to 1.
 * Cyclical coordinate descent; converges fast at portfolio sizes.
 */
export function equalRiskContributionWeights(
  cov: number[][],
  maxSweeps = 1000,
  tolerance = 1e-12
): number[] {
  const n = cov.length;
  if (n === 0) return [];
  if (n === 1) return [1];

  let x = new Array<number>(n).fill(1 / n);

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxDelta = 0;
    for (let i = 0; i < n; i++) {
      if (cov[i][i] <= 0) continue;
      let b = 0;
      for (let j = 0; j < n; j++) {
        if (j !== i) b += cov[i][j] * x[j];
      }
      const variance = portfolioVariance(cov, x);
      if (variance === 0) break;
      // Target variance contribution per name under sum-to-one weights.
      const lambda = variance / n;
      const next =
        (-b + Math.sqrt(b * b + 4 * cov[i][i] * lambda)) / (2 * cov[i][i]);
      maxDelta = Math.max(maxDelta, Math.abs(next - x[i]));
      x[i] = next;
    }
    const total = x.reduce((a, v) => a + v, 0);
    if (total > 0) x = x.map((v) => v / total);
    if (maxDelta < tolerance) break;
  }

  return x;
}

export function computeRiskContribution(
  weights: UniverseWeight[],
  estimate: CovarianceEstimate,
  whatIfAddUsd: number = WHAT_IF_ADD_USD
): RiskContribution | null {
  const index = new Map(estimate.tickers.map((t, i) => [t, i]));
  const covered = weights.filter((w) => index.has(w.ticker));
  const excludedTickers = weights
    .filter((w) => !index.has(w.ticker))
    .map((w) => w.ticker)
    .sort();

  const totalWeight = weights.reduce((a, w) => a + w.weightPct, 0);
  const coveredWeight = covered.reduce((a, w) => a + w.weightPct, 0);
  if (covered.length === 0 || coveredWeight <= 0) return null;

  // Reduce the covariance to the covered names, in weight order.
  const cov = covered.map((wi) =>
    covered.map((wj) => estimate.matrix[index.get(wi.ticker)!][index.get(wj.ticker)!])
  );
  const w = covered.map((c) => c.weightPct / coveredWeight);
  const coveredMarketValueUsd = covered.reduce((a, c) => a + c.marketValueUsd, 0);

  const variance = portfolioVariance(cov, w);
  const sigma = Math.sqrt(variance);
  const erc = equalRiskContributionWeights(cov);

  const rows: RiskContributionRow[] = covered.map((holding, i) => {
    let sigmaW = 0;
    for (let j = 0; j < w.length; j++) sigmaW += cov[i][j] * w[j];
    const riskShare = variance === 0 ? 0 : (w[i] * sigmaW) / variance;

    let addWhatIfVolDeltaPct: number | null = null;
    if (coveredMarketValueUsd > 0 && sigma > 0) {
      const bumped = covered.map((c, j) =>
        j === i ? c.marketValueUsd + whatIfAddUsd : c.marketValueUsd
      );
      const bumpedTotal = coveredMarketValueUsd + whatIfAddUsd;
      const wBumped = bumped.map((v) => v / bumpedTotal);
      const sigmaBumped = Math.sqrt(portfolioVariance(cov, wBumped));
      addWhatIfVolDeltaPct = (sigmaBumped - sigma) * 100;
    }

    return {
      ticker: holding.ticker,
      weightPct: w[i] * 100,
      riskContributionPct: riskShare * 100,
      ercWeightPct: (erc[i] ?? 0) * 100,
      standaloneVolPct: Math.sqrt(Math.max(0, cov[i][i])) * 100,
      addWhatIfVolDeltaPct,
    };
  });

  rows.sort((a, b) => b.riskContributionPct - a.riskContributionPct);

  return {
    portfolioVolPct: sigma * 100,
    rows,
    coveredWeightPct: totalWeight === 0 ? 0 : (coveredWeight / totalWeight) * 100,
    excludedTickers,
    coveredMarketValueUsd,
  };
}
