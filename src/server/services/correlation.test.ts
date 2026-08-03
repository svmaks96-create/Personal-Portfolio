import {
  computeCorrelationMatrix,
  computeConcentrationStats,
  dailyReturnsFromPrices,
  buildReturnsForWindow,
  DEFAULT_MIN_OVERLAP_DAYS,
} from "./correlation";
import type { DailyReturn } from "./risk-metrics";
import type { MarketDataInput } from "@/server/types/positions";

function dates(n: number, startDay = 1): string[] {
  return Array.from({ length: n }, (_, i) =>
    new Date(Date.UTC(2025, 0, startDay + i)).toISOString().slice(0, 10)
  );
}

/** Deterministic pseudo-random walk so tests never depend on Math.random. */
function pseudoReturns(n: number, seed: number, startDay = 1): DailyReturn[] {
  const ds = dates(n, startDay);
  let x = seed;
  return ds.map((date) => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return { date, ret: (x / 2147483648 - 0.5) * 0.04 };
  });
}

function scaled(source: DailyReturn[], factor: number): DailyReturn[] {
  return source.map((r) => ({ date: r.date, ret: r.ret * factor }));
}

describe("dailyReturnsFromPrices", () => {
  it("derives returns and respects the window", () => {
    const prices: MarketDataInput[] = [
      { symbol: "AAA", date: "2025-01-01", value: 100 },
      { symbol: "AAA", date: "2025-01-02", value: 110 },
      { symbol: "AAA", date: "2025-01-03", value: 99 },
    ];
    const all = dailyReturnsFromPrices(prices, "2025-01-01", "2025-01-03");
    expect(all).toHaveLength(2);
    expect(all[0].ret).toBeCloseTo(0.1, 9);
    expect(all[1].ret).toBeCloseTo(-0.1, 9);

    const clipped = dailyReturnsFromPrices(prices, "2025-01-02", "2025-01-03");
    expect(clipped).toHaveLength(1);
  });
});

describe("buildReturnsForWindow", () => {
  it("never invents observations before a series begins", () => {
    const calendar = dates(5);
    const priceHistory: Record<string, MarketDataInput[]> = {
      LATE: [
        { symbol: "LATE", date: "2025-01-04", value: 50 },
        { symbol: "LATE", date: "2025-01-05", value: 55 },
      ],
    };
    const out = buildReturnsForWindow(
      priceHistory,
      ["LATE"],
      calendar,
      "2025-01-01",
      "2025-01-05"
    );
    // First quote establishes the base; only one return follows.
    expect(out["LATE"]).toHaveLength(1);
    expect(out["LATE"][0].date).toBe("2025-01-05");
    expect(out["LATE"][0].ret).toBeCloseTo(0.1, 9);
  });

  it("forward-fills a gap inside the window as a zero return", () => {
    const calendar = dates(4);
    const priceHistory: Record<string, MarketDataInput[]> = {
      GAPPY: [
        { symbol: "GAPPY", date: "2025-01-01", value: 100 },
        { symbol: "GAPPY", date: "2025-01-04", value: 120 },
      ],
    };
    const out = buildReturnsForWindow(
      priceHistory,
      ["GAPPY"],
      calendar,
      "2025-01-01",
      "2025-01-04"
    );
    expect(out["GAPPY"].map((r) => r.ret)).toEqual([0, 0, expect.closeTo(0.2, 9)]);
  });

  it("returns an empty series for a ticker with no prices", () => {
    const out = buildReturnsForWindow({}, ["NONE"], dates(3), "2025-01-01", "2025-01-03");
    expect(out["NONE"]).toEqual([]);
  });
});

describe("computeCorrelationMatrix", () => {
  it("gives 1 on the diagonal, 1 for a scaled copy and -1 for a negated one", () => {
    const base = pseudoReturns(120, 7);
    const matrix = computeCorrelationMatrix({
      BASE: base,
      DOUBLE: scaled(base, 2),
      INVERSE: scaled(base, -1),
    });

    expect(matrix.tickers).toEqual(["BASE", "DOUBLE", "INVERSE"]);
    const i = (t: string) => matrix.tickers.indexOf(t);
    expect(matrix.values[i("BASE")][i("BASE")]).toBe(1);
    expect(matrix.values[i("BASE")][i("DOUBLE")]).toBeCloseTo(1, 9);
    expect(matrix.values[i("BASE")][i("INVERSE")]).toBeCloseTo(-1, 9);
    // Symmetric.
    expect(matrix.values[i("DOUBLE")][i("BASE")]).toBeCloseTo(1, 9);
  });

  it("excludes a ticker with too few observations and says why", () => {
    const matrix = computeCorrelationMatrix({
      FULL: pseudoReturns(120, 3),
      // The SPCX case: a currently-held name with almost no history.
      THIN: pseudoReturns(9, 5),
    });

    expect(matrix.tickers).toEqual(["FULL"]);
    expect(matrix.excluded).toHaveLength(1);
    expect(matrix.excluded[0].ticker).toBe("THIN");
    expect(matrix.excluded[0].observations).toBe(9);
    expect(matrix.excluded[0].reason).toMatch(/below the 60-day minimum/);
  });

  it("nulls a cell when two series barely overlap, keeping both tickers", () => {
    // Both have enough observations individually, but on disjoint dates.
    const early = pseudoReturns(80, 11, 1);
    const late = pseudoReturns(80, 13, 200);
    const matrix = computeCorrelationMatrix({ EARLY: early, LATE: late });

    expect(matrix.tickers).toEqual(["EARLY", "LATE"]);
    expect(matrix.values[0][1]).toBeNull();
    expect(matrix.overlapDays[0][1]).toBe(0);
  });

  it("honours a custom minimum overlap", () => {
    const matrix = computeCorrelationMatrix(
      { A: pseudoReturns(20, 2), B: pseudoReturns(20, 4) },
      { minOverlapDays: 10 }
    );
    expect(matrix.tickers).toEqual(["A", "B"]);
    expect(matrix.values[0][1]).not.toBeNull();
    expect(matrix.minOverlapDays).toBe(10);
  });

  it("defaults to a 60-day minimum overlap", () => {
    expect(DEFAULT_MIN_OVERLAP_DAYS).toBe(60);
  });
});

describe("computeConcentrationStats", () => {
  it("gives effective bets equal to n for equal weights", () => {
    const returns = {
      A: pseudoReturns(120, 1),
      B: pseudoReturns(120, 2),
      C: pseudoReturns(120, 3),
      D: pseudoReturns(120, 4),
    };
    const matrix = computeCorrelationMatrix(returns);
    const weights = ["A", "B", "C", "D"].map((ticker) => ({ ticker, weightPct: 25 }));

    const stats = computeConcentrationStats(weights, matrix, returns);
    expect(stats.hhi).toBeCloseTo(0.25, 9);
    expect(stats.effectiveNumberOfBets).toBeCloseTo(4, 9);
    expect(stats.coveredWeightPct).toBeCloseTo(100, 9);
  });

  it("drops effective bets sharply when one position dominates", () => {
    const returns = { A: pseudoReturns(120, 1), B: pseudoReturns(120, 2) };
    const matrix = computeCorrelationMatrix(returns);
    const stats = computeConcentrationStats(
      [
        { ticker: "A", weightPct: 90 },
        { ticker: "B", weightPct: 10 },
      ],
      matrix,
      returns
    );
    expect(stats.hhi).toBeCloseTo(0.82, 9);
    expect(stats.effectiveNumberOfBets).toBeCloseTo(1 / 0.82, 9);
  });

  it("gives a diversification ratio of 1 for a single asset", () => {
    const returns = { A: pseudoReturns(120, 1) };
    const matrix = computeCorrelationMatrix(returns);
    const stats = computeConcentrationStats([{ ticker: "A", weightPct: 100 }], matrix, returns);
    expect(stats.diversificationRatio).toBeCloseTo(1, 6);
  });

  it("gives a ratio near sqrt(n) for uncorrelated equal-weight assets", () => {
    const returns = {
      A: pseudoReturns(400, 17),
      B: pseudoReturns(400, 991),
      C: pseudoReturns(400, 4241),
      D: pseudoReturns(400, 55589),
    };
    const matrix = computeCorrelationMatrix(returns);
    const weights = ["A", "B", "C", "D"].map((ticker) => ({ ticker, weightPct: 25 }));
    const stats = computeConcentrationStats(weights, matrix, returns);

    // Not exactly 2 — the pseudo series are only approximately independent —
    // but it must sit well above 1 and below sqrt(4).
    expect(stats.diversificationRatio!).toBeGreaterThan(1.3);
    expect(stats.diversificationRatio!).toBeLessThanOrEqual(2.05);
  });

  it("reports covered weight when a holding cannot be correlated", () => {
    const returns = {
      A: pseudoReturns(120, 1),
      B: pseudoReturns(120, 2),
      THIN: pseudoReturns(5, 3),
    };
    const matrix = computeCorrelationMatrix(returns);
    const stats = computeConcentrationStats(
      [
        { ticker: "A", weightPct: 50 },
        { ticker: "B", weightPct: 30 },
        { ticker: "THIN", weightPct: 20 },
      ],
      matrix,
      returns
    );

    // HHI still uses every weight; only the ratio drops the uncorrelatable name.
    expect(stats.hhi).toBeCloseTo(0.25 + 0.09 + 0.04, 9);
    expect(stats.excludedFromRatio).toEqual(["THIN"]);
    expect(stats.coveredWeightPct).toBeCloseTo(80, 9);
  });

  it("surfaces the most and least correlated pairs", () => {
    const base = pseudoReturns(120, 7);
    const returns = {
      BASE: base,
      TWIN: scaled(base, 1.5),
      OPPOSITE: scaled(base, -1),
    };
    const matrix = computeCorrelationMatrix(returns);
    const stats = computeConcentrationStats(
      Object.keys(returns).map((ticker) => ({ ticker, weightPct: 100 / 3 })),
      matrix,
      returns
    );

    expect(stats.mostCorrelatedPair!.value).toBeCloseTo(1, 6);
    expect([stats.mostCorrelatedPair!.a, stats.mostCorrelatedPair!.b].sort()).toEqual([
      "BASE",
      "TWIN",
    ]);
    expect(stats.leastCorrelatedPair!.value).toBeCloseTo(-1, 6);
    expect(stats.avgPairwiseCorrelation).not.toBeNull();
  });

  it("handles an empty book without throwing", () => {
    const matrix = computeCorrelationMatrix({});
    const stats = computeConcentrationStats([], matrix, {});
    expect(stats.hhi).toBe(0);
    expect(stats.effectiveNumberOfBets).toBe(0);
    expect(stats.diversificationRatio).toBeNull();
    expect(stats.mostCorrelatedPair).toBeNull();
  });
});
