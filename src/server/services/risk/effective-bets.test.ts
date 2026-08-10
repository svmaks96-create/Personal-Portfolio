import { describe, expect, it } from "vitest";
import {
  computeEffectiveBets,
  principalBetShares,
} from "@/server/services/risk/effective-bets";
import type { CovarianceEstimate } from "@/server/services/risk/covariance";
import type { UniverseWeight } from "@/server/services/risk/weights";

function covFrom(vols: number[], corr: number[][]): number[][] {
  return vols.map((vi, i) => vols.map((vj, j) => vi * vj * corr[i][j]));
}

function estimateFor(tickers: string[], vols: number[], corr: number[][]): CovarianceEstimate {
  const matrix = covFrom(vols, corr);
  return {
    tickers,
    matrix,
    correlation: corr,
    sampleCorrelation: corr,
    vols,
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

function equalWeights(tickers: string[]): UniverseWeight[] {
  return tickers.map((ticker) => ({
    ticker,
    weightPct: 100 / tickers.length,
    marketValueUsd: 10_000,
  }));
}

function identity(n: number): number[][] {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );
}

describe("computeEffectiveBets", () => {
  it("equal-weight independent equal-vol names count as n bets", () => {
    const tickers = ["A", "B", "C", "D"];
    const bets = computeEffectiveBets(
      estimateFor(tickers, [0.3, 0.3, 0.3, 0.3], identity(4)),
      equalWeights(tickers)
    )!;
    expect(bets.enb).toBeCloseTo(4, 6);
    expect(bets.topBetSharePct).toBeCloseTo(25, 6);
    expect(bets.universeEffectiveRank).toBeCloseTo(4, 6);
    expect(bets.weightOnlyBets).toBeCloseTo(4, 6);
  });

  it("near-perfectly correlated names collapse to ~1 bet", () => {
    const tickers = ["A", "B", "C"];
    const rho = 0.98;
    const corr = [
      [1, rho, rho],
      [rho, 1, rho],
      [rho, rho, 1],
    ];
    const bets = computeEffectiveBets(
      estimateFor(tickers, [0.3, 0.3, 0.3], corr),
      equalWeights(tickers)
    )!;
    expect(bets.enb).toBeLessThan(1.15);
    expect(bets.topBetSharePct).toBeGreaterThan(95);
    // Weight-only lens still says 3 — that's the point of showing both.
    expect(bets.weightOnlyBets).toBeCloseTo(3, 6);
  });

  it("two independent blocks with equal risk count as ~2 bets", () => {
    const tickers = ["A1", "A2", "B1", "B2"];
    const rho = 0.95;
    const corr = [
      [1, rho, 0, 0],
      [rho, 1, 0, 0],
      [0, 0, 1, rho],
      [0, 0, rho, 1],
    ];
    const bets = computeEffectiveBets(
      estimateFor(tickers, [0.3, 0.3, 0.3, 0.3], corr),
      equalWeights(tickers)
    )!;
    expect(bets.enb).toBeGreaterThan(1.9);
    expect(bets.enb).toBeLessThan(2.3);
  });

  it("concentration collapses the count even when names are independent", () => {
    const tickers = ["BIG", "S1", "S2", "S3"];
    const weights: UniverseWeight[] = [
      { ticker: "BIG", weightPct: 94, marketValueUsd: 94_000 },
      { ticker: "S1", weightPct: 2, marketValueUsd: 2_000 },
      { ticker: "S2", weightPct: 2, marketValueUsd: 2_000 },
      { ticker: "S3", weightPct: 2, marketValueUsd: 2_000 },
    ];
    const bets = computeEffectiveBets(
      estimateFor(tickers, [0.3, 0.3, 0.3, 0.3], identity(4)),
      weights
    )!;
    expect(bets.enb).toBeLessThan(1.2);
    // The universe still spans 4 dimensions — sizing is what collapsed it.
    expect(bets.universeEffectiveRank).toBeCloseTo(4, 6);
  });

  it("ignores weights outside the covariance and renormalizes", () => {
    const tickers = ["A", "B"];
    const weights: UniverseWeight[] = [
      { ticker: "A", weightPct: 30, marketValueUsd: 30_000 },
      { ticker: "B", weightPct: 30, marketValueUsd: 30_000 },
      { ticker: "YOUNG", weightPct: 40, marketValueUsd: 40_000 },
    ];
    const bets = computeEffectiveBets(
      estimateFor(tickers, [0.3, 0.3], identity(2)),
      weights
    )!;
    expect(bets.coveredCount).toBe(2);
    expect(bets.enb).toBeCloseTo(2, 6);
  });

  it("principal bet shares sum to one", () => {
    const corr = [
      [1, 0.7, 0.2],
      [0.7, 1, 0.4],
      [0.2, 0.4, 1],
    ];
    const cov = covFrom([0.25, 0.4, 0.3], corr);
    const shares = principalBetShares(cov, [0.5, 0.3, 0.2]);
    expect(shares.reduce((a, s) => a + s, 0)).toBeCloseTo(1, 10);
    for (const s of shares) expect(s).toBeGreaterThanOrEqual(0);
  });
});
