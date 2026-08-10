import { describe, expect, it } from "vitest";
import {
  clusterByCorrelation,
  matchClusterNames,
} from "@/server/services/risk/clustering";
import type { CovarianceEstimate } from "@/server/services/risk/covariance";
import type { UniverseWeight } from "@/server/services/risk/weights";

function estimateFor(tickers: string[], corr: number[][]): CovarianceEstimate {
  return {
    tickers,
    matrix: corr,
    correlation: corr,
    sampleCorrelation: corr,
    vols: tickers.map(() => 0.3),
    shrinkageIntensity: 0,
    avgCorrelation: 0,
    observationCount: 252,
    windowFrom: null,
    windowTo: null,
    excluded: [],
    limitingTicker: null,
    psdRepaired: false,
  };
}

function weightsFor(entries: [string, number][]): UniverseWeight[] {
  return entries.map(([ticker, weightPct]) => ({
    ticker,
    weightPct,
    marketValueUsd: weightPct * 1000,
  }));
}

// Two tight blocks (AI semis, software) plus a loner.
const TICKERS = ["NVDA", "AVGO", "TSM", "CRM", "ADBE", "BABA"];
const CORR = [
  [1.0, 0.8, 0.75, 0.3, 0.3, 0.1],
  [0.8, 1.0, 0.7, 0.3, 0.3, 0.1],
  [0.75, 0.7, 1.0, 0.3, 0.3, 0.1],
  [0.3, 0.3, 0.3, 1.0, 0.65, 0.1],
  [0.3, 0.3, 0.3, 0.65, 1.0, 0.1],
  [0.1, 0.1, 0.1, 0.1, 0.1, 1.0],
];
const WEIGHTS = weightsFor([
  ["NVDA", 20],
  ["AVGO", 15],
  ["TSM", 15],
  ["CRM", 20],
  ["ADBE", 10],
  ["BABA", 20],
]);

describe("clusterByCorrelation", () => {
  it("finds the two blocks and leaves the loner alone", () => {
    const clusters = clusterByCorrelation(estimateFor(TICKERS, CORR), WEIGHTS, 0.5);
    const memberSets = clusters.map((c) => c.members.join(","));
    expect(memberSets).toContain("AVGO,NVDA,TSM");
    expect(memberSets).toContain("ADBE,CRM");
    expect(memberSets).toContain("BABA");
    expect(clusters).toHaveLength(3);
  });

  it("sorts clusters by total weight and reports internal correlation", () => {
    const clusters = clusterByCorrelation(estimateFor(TICKERS, CORR), WEIGHTS, 0.5);
    expect(clusters[0].members).toEqual(["AVGO", "NVDA", "TSM"]);
    expect(clusters[0].totalWeightPct).toBeCloseTo(50, 10);
    expect(clusters[0].avgInternalCorrelation).toBeCloseTo((0.8 + 0.75 + 0.7) / 3, 10);
    const loner = clusters.find((c) => c.members.length === 1)!;
    expect(loner.avgInternalCorrelation).toBeNull();
  });

  it("a high threshold yields all singletons, a floor threshold one cluster", () => {
    const singletons = clusterByCorrelation(estimateFor(TICKERS, CORR), WEIGHTS, 0.9);
    expect(singletons).toHaveLength(6);
    const one = clusterByCorrelation(estimateFor(TICKERS, CORR), WEIGHTS, -1);
    expect(one).toHaveLength(1);
    expect(one[0].members).toHaveLength(6);
  });
});

describe("matchClusterNames", () => {
  const clusters = clusterByCorrelation(estimateFor(TICKERS, CORR), WEIGHTS, 0.5);

  it("re-attaches names by member overlap", () => {
    const names = matchClusterNames(clusters, [
      { name: "AI capex", members: ["NVDA", "AVGO", "TSM"] },
      { name: "Software duration", members: ["CRM", "ADBE"] },
    ]);
    expect(names[0]).toBe("AI capex");
    const softwareIndex = clusters.findIndex((c) => c.members.includes("CRM"));
    expect(names[softwareIndex]).toBe("Software duration");
  });

  it("survives drift but refuses a label past recognition", () => {
    // One member swapped: 2-of-3 overlap with a 4-ticker union → 0.5 < J fails… use 3-of-4.
    const names = matchClusterNames(clusters, [
      { name: "AI capex", members: ["NVDA", "AVGO", "TSM", "ASML"] },
    ]);
    expect(names[0]).toBe("AI capex"); // Jaccard 3/4

    const stale = matchClusterNames(clusters, [
      { name: "Old world", members: ["NVDA", "KLAR", "FIG", "RBRK"] },
    ]);
    expect(stale[0]).toBeNull(); // Jaccard 1/6
  });

  it("never assigns one stored label to two clusters", () => {
    const names = matchClusterNames(clusters, [
      { name: "Everything", members: ["NVDA", "AVGO", "TSM"] },
    ]);
    expect(names.filter((n) => n === "Everything")).toHaveLength(1);
  });
});
