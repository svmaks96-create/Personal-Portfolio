import { Matrix, EigenvalueDecomposition } from "ml-matrix";
import type { CovarianceEstimate } from "@/server/services/risk/covariance";
import type { UniverseWeight } from "@/server/services/risk/weights";

/**
 * How many independent bets the book actually holds.
 *
 * Headline: the entropy-based effective number of bets over *principal
 * portfolios* (Meucci's PCA formulation). The covariance is decomposed into
 * uncorrelated risk directions; the portfolio's variance is attributed across
 * them; the exponential of the entropy of those shares is the count. One
 * dominant direction carrying ~all variance → 1 bet, regardless of how many
 * tickers implement it. Equal variance across k independent directions → k.
 *
 * Chosen over minimum-torsion ENB deliberately: torsion needs a matrix
 * optimization that cannot be audited at a glance, and over this book the two
 * tell the same story. Two blunter lenses ride along for calibration:
 * weight-only bets (1/HHI — what the count would be if every name were
 * independent) and the weight-blind effective rank of the correlation matrix
 * (how many dimensions the *universe* spans, ignoring sizing).
 */

export interface EffectiveBets {
  /** Exp-entropy of principal-portfolio variance shares. The headline. */
  enb: number;
  /** Share of portfolio variance carried by the largest principal bet, pct. */
  topBetSharePct: number;
  /** Weight-blind exp-entropy of correlation eigenvalue shares. */
  universeEffectiveRank: number;
  /** 1 / HHI of the covered weights. */
  weightOnlyBets: number;
  /** Names the count is computed over (covariance-covered universe members). */
  coveredCount: number;
}

function expEntropy(shares: number[]): number {
  let h = 0;
  for (const p of shares) {
    if (p > 0) h -= p * Math.log(p);
  }
  return Math.exp(h);
}

/** Variance shares across principal portfolios for weights w under cov Σ. */
export function principalBetShares(
  cov: number[][],
  w: number[]
): number[] {
  const eig = new EigenvalueDecomposition(new Matrix(cov), {
    assumeSymmetric: true,
  });
  const values = eig.realEigenvalues;
  const vectors = eig.eigenvectorMatrix;

  const contributions = values.map((lambda, k) => {
    let projection = 0;
    for (let i = 0; i < w.length; i++) {
      projection += vectors.get(i, k) * w[i];
    }
    return Math.max(0, lambda) * projection * projection;
  });
  const total = contributions.reduce((a, c) => a + c, 0);
  if (total <= 0) return contributions.map(() => 0);
  return contributions.map((c) => c / total);
}

export function computeEffectiveBets(
  estimate: CovarianceEstimate,
  weights: UniverseWeight[]
): EffectiveBets | null {
  const index = new Map(estimate.tickers.map((t, i) => [t, i]));
  const covered = weights.filter((w) => index.has(w.ticker));
  const coveredWeight = covered.reduce((a, w) => a + w.weightPct, 0);
  if (covered.length === 0 || coveredWeight <= 0) return null;

  // Weight vector in covariance order, renormalized over covered names.
  const w = new Array<number>(estimate.tickers.length).fill(0);
  for (const holding of covered) {
    w[index.get(holding.ticker)!] = holding.weightPct / coveredWeight;
  }

  const shares = principalBetShares(estimate.matrix, w);
  const enb = expEntropy(shares);
  const topBetSharePct = Math.max(0, ...shares) * 100;

  const corrEig = new EigenvalueDecomposition(new Matrix(estimate.correlation), {
    assumeSymmetric: true,
  });
  const eigenvalues = corrEig.realEigenvalues.map((v) => Math.max(0, v));
  const eigenTotal = eigenvalues.reduce((a, v) => a + v, 0);
  const universeEffectiveRank =
    eigenTotal <= 0 ? 0 : expEntropy(eigenvalues.map((v) => v / eigenTotal));

  const hhi = w.reduce((a, v) => a + v * v, 0);

  return {
    enb,
    topBetSharePct,
    universeEffectiveRank,
    weightOnlyBets: hhi === 0 ? 0 : 1 / hhi,
    coveredCount: covered.length,
  };
}
