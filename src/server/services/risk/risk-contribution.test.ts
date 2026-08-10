import { describe, expect, it } from "vitest";
import {
  computeRiskContribution,
  equalRiskContributionWeights,
} from "@/server/services/risk/risk-contribution";
import type { CovarianceEstimate } from "@/server/services/risk/covariance";
import type { UniverseWeight } from "@/server/services/risk/weights";

/** Covariance from vols (fractions) and a correlation matrix. */
function covFrom(vols: number[], corr: number[][]): number[][] {
  return vols.map((vi, i) => vols.map((vj, j) => vi * vj * corr[i][j]));
}

function estimateFor(
  tickers: string[],
  matrix: number[][]
): CovarianceEstimate {
  return {
    tickers,
    matrix,
    correlation: [],
    sampleCorrelation: [],
    vols: matrix.map((row, i) => Math.sqrt(row[i])),
    shrinkageIntensity: 0,
    avgCorrelation: 0,
    observationCount: 252,
    windowFrom: "2025-01-01",
    windowTo: "2025-12-31",
    excluded: [],
    limitingTicker: null,
    psdRepaired: false,
  };
}

function weightsFor(entries: [string, number][]): UniverseWeight[] {
  const total = entries.reduce((a, [, v]) => a + v, 0);
  return entries.map(([ticker, marketValueUsd]) => ({
    ticker,
    marketValueUsd,
    weightPct: (marketValueUsd / total) * 100,
  }));
}

describe("equalRiskContributionWeights", () => {
  it("two assets: ERC weights are inverse-vol regardless of correlation", () => {
    for (const rho of [-0.5, 0, 0.4, 0.9]) {
      const cov = covFrom([0.4, 0.2], [
        [1, rho],
        [rho, 1],
      ]);
      const [w1, w2] = equalRiskContributionWeights(cov);
      // Closed form for n=2: w_i ∝ 1/σ_i.
      expect(w1 / w2).toBeCloseTo(0.2 / 0.4, 8);
      expect(w1 + w2).toBeCloseTo(1, 12);
    }
  });

  it("diagonal covariance: ERC is inverse-vol for any n", () => {
    const vols = [0.1, 0.2, 0.4, 0.25];
    const cov = covFrom(
      vols,
      vols.map((_, i) => vols.map((_, j) => (i === j ? 1 : 0)))
    );
    const w = equalRiskContributionWeights(cov);
    const invVolSum = vols.reduce((a, v) => a + 1 / v, 0);
    vols.forEach((v, i) => {
      expect(w[i]).toBeCloseTo(1 / v / invVolSum, 8);
    });
  });

  it("resulting risk contributions are equal", () => {
    const corr = [
      [1, 0.8, 0.3],
      [0.8, 1, 0.1],
      [0.3, 0.1, 1],
    ];
    const cov = covFrom([0.35, 0.45, 0.2], corr);
    const w = equalRiskContributionWeights(cov);

    const sigmaW = w.map((_, i) =>
      w.reduce((a, wj, j) => a + cov[i][j] * wj, 0)
    );
    const contributions = w.map((wi, i) => wi * sigmaW[i]);
    const target = contributions.reduce((a, c) => a + c, 0) / w.length;
    for (const c of contributions) {
      expect(c).toBeCloseTo(target, 8);
    }
  });
});

describe("computeRiskContribution", () => {
  it("risk shares sum to 100 and portfolio vol matches the quadratic form", () => {
    const corr = [
      [1, 0.7],
      [0.7, 1],
    ];
    const cov = covFrom([0.3, 0.5], corr);
    const estimate = estimateFor(["AAA", "BBB"], cov);
    const weights = weightsFor([
      ["AAA", 60_000],
      ["BBB", 40_000],
    ]);

    const result = computeRiskContribution(weights, estimate)!;
    const total = result.rows.reduce((a, r) => a + r.riskContributionPct, 0);
    expect(total).toBeCloseTo(100, 8);

    // Hand-computed: σ² = .36·.09 + .16·.25 + 2·.24·(.3·.5·.7)
    const variance =
      0.36 * 0.09 + 0.16 * 0.25 + 2 * 0.6 * 0.4 * 0.3 * 0.5 * 0.7;
    expect(result.portfolioVolPct).toBeCloseTo(Math.sqrt(variance) * 100, 8);
  });

  it("the higher-vol, correlated name contributes more risk than weight", () => {
    const cov = covFrom([0.25, 0.55], [
      [1, 0.6],
      [0.6, 1],
    ]);
    const estimate = estimateFor(["SAFE", "SPICY"], cov);
    const weights = weightsFor([
      ["SAFE", 50_000],
      ["SPICY", 50_000],
    ]);
    const result = computeRiskContribution(weights, estimate)!;
    const spicy = result.rows.find((r) => r.ticker === "SPICY")!;
    expect(spicy.riskContributionPct).toBeGreaterThan(spicy.weightPct);
    // Rows are sorted by risk contribution, descending.
    expect(result.rows[0].ticker).toBe("SPICY");
  });

  it("adding $10k to a correlated name raises vol more than to a diversifier", () => {
    // C is negatively correlated with the rest — the diversifier.
    const corr = [
      [1, 0.9, -0.2],
      [0.9, 1, -0.2],
      [-0.2, -0.2, 1],
    ];
    const cov = covFrom([0.35, 0.35, 0.3], corr);
    const estimate = estimateFor(["A", "B", "C"], cov);
    const weights = weightsFor([
      ["A", 40_000],
      ["B", 40_000],
      ["C", 20_000],
    ]);
    const result = computeRiskContribution(weights, estimate)!;
    const a = result.rows.find((r) => r.ticker === "A")!;
    const c = result.rows.find((r) => r.ticker === "C")!;
    expect(a.addWhatIfVolDeltaPct!).toBeGreaterThan(c.addWhatIfVolDeltaPct!);
    expect(c.addWhatIfVolDeltaPct!).toBeLessThan(0); // diversifier reduces vol
  });

  it("names without covariance rows are excluded, reported, and renormalized around", () => {
    const cov = covFrom([0.3, 0.4], [
      [1, 0.5],
      [0.5, 1],
    ]);
    const estimate = estimateFor(["AAA", "BBB"], cov);
    const weights = weightsFor([
      ["AAA", 45_000],
      ["BBB", 30_000],
      ["YOUNG", 25_000],
    ]);
    const result = computeRiskContribution(weights, estimate)!;
    expect(result.excludedTickers).toEqual(["YOUNG"]);
    expect(result.coveredWeightPct).toBeCloseTo(75, 8);
    const sum = result.rows.reduce((a, r) => a + r.weightPct, 0);
    expect(sum).toBeCloseTo(100, 8);
    expect(result.coveredMarketValueUsd).toBe(75_000);
  });

  it("returns null when nothing is covered", () => {
    const estimate = estimateFor([], []);
    const weights = weightsFor([["AAA", 10_000]]);
    expect(computeRiskContribution(weights, estimate)).toBeNull();
  });
});
