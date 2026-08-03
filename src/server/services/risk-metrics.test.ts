import {
  dailyReturnsFromGrowth,
  computeDrawdowns,
  computeRiskStats,
  computeRobustRiskStats,
  computeBenchmarkRelation,
  rollingVolatility,
  findAnomalousDays,
  sliceGrowth,
  computeRegimeSlices,
  TRADING_DAYS_PER_YEAR,
  type GrowthPoint,
} from "./risk-metrics";
import { pearson, ols, skewness, excessKurtosis } from "./series-utils";

/** Builds a growth series from a list of daily returns, starting at 1.0. */
function growthFrom(returns: number[], startDate = "2025-01-01"): GrowthPoint[] {
  const out: GrowthPoint[] = [{ date: startDate, growthOfDollar: 1 }];
  let g = 1;
  for (let i = 0; i < returns.length; i += 1) {
    g *= 1 + returns[i];
    const d = new Date(Date.UTC(2025, 0, 2 + i));
    out.push({ date: d.toISOString().slice(0, 10), growthOfDollar: g });
  }
  return out;
}

function series(rows: [string, number][]): GrowthPoint[] {
  return rows.map(([date, growthOfDollar]) => ({ date, growthOfDollar }));
}

describe("series-utils regression primitives", () => {
  it("correlates a series with itself and its negation", () => {
    const x = [1, 2, 3, 4, 5];
    expect(pearson(x, x)).toBeCloseTo(1, 9);
    expect(pearson(x, x.map((v) => -v))).toBeCloseTo(-1, 9);
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it("recovers the slope of a known linear relationship", () => {
    const x = [1, 2, 3, 4, 5];
    expect(ols(x, x)!.beta).toBeCloseTo(1, 9);
    expect(ols(x, x)!.r2).toBeCloseTo(1, 9);
    expect(ols(x.map((v) => 2 * v), x)!.beta).toBeCloseTo(2, 9);
    // y = 2x + 3
    const fit = ols(x.map((v) => 2 * v + 3), x)!;
    expect(fit.beta).toBeCloseTo(2, 9);
    expect(fit.alpha).toBeCloseTo(3, 9);
    expect(ols([1, 2, 3], [5, 5, 5])).toBeNull();
  });

  it("computes skew and excess kurtosis", () => {
    expect(skewness([1, 1, 1, 1])).toBe(0);
    expect(skewness([1, 2, 3])).toBeCloseTo(0, 9);
    // Right-skewed sample.
    expect(skewness([1, 1, 1, 10])!).toBeGreaterThan(0);
    expect(excessKurtosis([1, 2, 3])).toBeNull();
    expect(excessKurtosis([1, 1, 1, 1])).toBe(0);
  });
});

describe("dailyReturnsFromGrowth", () => {
  it("inverts a growth series back into returns", () => {
    const g = growthFrom([0.01, -0.02, 0.03]);
    const r = dailyReturnsFromGrowth(g);
    expect(r).toHaveLength(3);
    expect(r[0].ret).toBeCloseTo(0.01, 12);
    expect(r[1].ret).toBeCloseTo(-0.02, 12);
    expect(r[2].ret).toBeCloseTo(0.03, 12);
  });

  it("returns nothing for a single point", () => {
    expect(dailyReturnsFromGrowth([{ date: "2025-01-01", growthOfDollar: 1 }])).toEqual([]);
  });
});

describe("computeDrawdowns", () => {
  it("finds a drawdown that recovers", () => {
    const g = series([
      ["2025-01-01", 1.0],
      ["2025-01-02", 1.2],
      ["2025-01-03", 0.9],
      ["2025-01-04", 1.3],
    ]);
    const d = computeDrawdowns(g);

    expect(d.episodes).toHaveLength(1);
    const e = d.episodes[0];
    expect(e.peakDate).toBe("2025-01-02");
    expect(e.troughDate).toBe("2025-01-03");
    expect(e.depthPct).toBeCloseTo((0.9 / 1.2 - 1) * 100, 9);
    expect(e.recoveryDate).toBe("2025-01-04");
    expect(e.isRecovered).toBe(true);
    expect(d.maxDrawdownPct).toBeCloseTo(-25, 9);
    expect(d.currentDrawdownPct).toBeCloseTo(0, 9);
  });

  it("reports an unrecovered final drawdown rather than dropping it", () => {
    const g = series([
      ["2025-01-01", 1.0],
      ["2025-01-02", 2.0],
      ["2025-01-03", 1.0],
    ]);
    const d = computeDrawdowns(g);

    expect(d.episodes).toHaveLength(1);
    expect(d.episodes[0].recoveryDate).toBeNull();
    expect(d.episodes[0].isRecovered).toBe(false);
    expect(d.episodes[0].recoveryDays).toBeNull();
    expect(d.currentDrawdownPct).toBeCloseTo(-50, 9);
  });

  it("produces non-overlapping episodes ranked by depth", () => {
    const g = series([
      ["2025-01-01", 1.0],
      ["2025-01-02", 0.9], // -10%
      ["2025-01-03", 1.0],
      ["2025-01-04", 1.5],
      ["2025-01-05", 1.05], // -30%
      ["2025-01-06", 1.6],
    ]);
    const d = computeDrawdowns(g);

    expect(d.episodes).toHaveLength(2);
    // Ranked by depth, so [0] is the later, deeper episode.
    expect(d.episodes[0].depthPct).toBeCloseTo(-30, 9);
    expect(d.episodes[1].depthPct).toBeCloseTo(-10, 9);

    // Non-overlapping in time: the deeper episode's peak comes after the
    // shallower one has fully recovered.
    const chronological = [...d.episodes].sort((a, b) =>
      a.peakDate.localeCompare(b.peakDate)
    );
    expect(chronological[0].recoveryDate).not.toBeNull();
    expect(chronological[1].peakDate >= chronological[0].recoveryDate!).toBe(true);
  });

  it("finds no drawdown in a monotonically rising series", () => {
    const d = computeDrawdowns(growthFrom([0.01, 0.01, 0.01]));
    expect(d.episodes).toEqual([]);
    expect(d.maxDrawdownPct).toBeNull();
  });

  it("handles an empty series", () => {
    const d = computeDrawdowns([]);
    expect(d.maxDrawdownPct).toBeNull();
    expect(d.episodes).toEqual([]);
  });
});

describe("computeRiskStats", () => {
  it("reports zero volatility for a constant-return series", () => {
    const s = computeRiskStats(growthFrom([0.001, 0.001, 0.001, 0.001]));
    expect(s.annualizedVolPct).toBeCloseTo(0, 9);
    expect(s.positiveDaysPct).toBe(100);
    expect(s.maxDrawdownPct).toBeNull();
  });

  it("labels the risk-free assumption and returns zero Sharpe when rf equals the mean", () => {
    const daily = 0.0004;
    const g = growthFrom(Array(60).fill(daily));
    // A constant series has zero deviation, so Sharpe is undefined, not zero.
    expect(computeRiskStats(g).sharpe).toBeNull();

    const mixed = growthFrom([0.01, -0.005, 0.008, -0.002, 0.006, -0.001]);
    const s = computeRiskStats(mixed, 4);
    expect(s.riskFreeAnnualPct).toBe(4);
    expect(s.sharpe).not.toBeNull();
    // A higher assumed risk-free rate must lower Sharpe.
    expect(s.sharpe!).toBeLessThan(computeRiskStats(mixed, 0).sharpe!);
  });

  it("returns null Sortino rather than Infinity when nothing is negative", () => {
    const s = computeRiskStats(growthFrom([0.01, 0.02, 0.015]), 0);
    expect(s.sortino).toBeNull();
    expect(Number.isFinite(s.sortino ?? 0)).toBe(true);
  });

  it("annualizes volatility by the square root of trading days", () => {
    const returns = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
    const s = computeRiskStats(growthFrom(returns));
    // Sample stdev of the realised daily returns, scaled.
    expect(s.annualizedVolPct!).toBeGreaterThan(0);
    expect(s.n).toBe(returns.length);
    expect(TRADING_DAYS_PER_YEAR).toBe(252);
  });

  it("computes VaR and CVaR from the left tail", () => {
    const returns = [-0.05, -0.03, -0.01, 0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06];
    const s = computeRiskStats(growthFrom(returns));
    expect(s.var95Pct).not.toBeNull();
    expect(s.cvar95Pct!).toBeLessThanOrEqual(s.var95Pct!);
    expect(s.worstDayPct).toBeCloseTo(-5, 6);
    expect(s.bestDayPct).toBeCloseTo(6, 6);
  });

  it("handles a series too short to measure", () => {
    const s = computeRiskStats([{ date: "2025-01-01", growthOfDollar: 1 }]);
    expect(s.annualizedVolPct).toBeNull();
    expect(s.sharpe).toBeNull();
  });
});

describe("computeRobustRiskStats", () => {
  it("excludes extreme days and diverges from the headline when they matter", () => {
    const returns = [0.005, -0.004, 0.6, 0.003, -0.002];
    const headline = computeRiskStats(growthFrom(returns));
    const robust = computeRobustRiskStats(growthFrom(returns));

    expect(robust.n).toBe(returns.length - 1);
    expect(robust.annualizedVolPct!).toBeLessThan(headline.annualizedVolPct!);
  });

  it("leaves a well-behaved series untouched", () => {
    const returns = [0.005, -0.004, 0.003, -0.002];
    const headline = computeRiskStats(growthFrom(returns));
    const robust = computeRobustRiskStats(growthFrom(returns));
    expect(robust.n).toBe(headline.n);
    expect(robust.annualizedVolPct).toBeCloseTo(headline.annualizedVolPct!, 9);
  });
});

describe("computeBenchmarkRelation", () => {
  it("gives beta 1 and r2 1 against itself", () => {
    const g = growthFrom([0.01, -0.02, 0.03, 0.005]);
    const r = computeBenchmarkRelation("SELF", g, g);
    expect(r.beta).toBeCloseTo(1, 9);
    expect(r.r2).toBeCloseTo(1, 9);
    expect(r.correlation).toBeCloseTo(1, 9);
    expect(r.trackingErrorPct).toBeCloseTo(0, 9);
  });

  it("recovers a 2x leveraged beta", () => {
    const base = [0.01, -0.02, 0.03, 0.005, -0.01];
    const bench = growthFrom(base);
    const port = growthFrom(base.map((v) => 2 * v));
    const r = computeBenchmarkRelation("SPY", port, bench);
    expect(r.beta).toBeCloseTo(2, 6);
    expect(r.upCapturePct).toBeCloseTo(200, 4);
    expect(r.downCapturePct).toBeCloseTo(200, 4);
  });

  it("intersects on shared dates only", () => {
    const port = series([
      ["2025-01-01", 1],
      ["2025-01-02", 1.1],
      ["2025-01-03", 1.2],
    ]);
    const bench = series([
      ["2025-01-02", 1],
      ["2025-01-03", 1.05],
    ]);
    const r = computeBenchmarkRelation("SPY", port, bench);
    // Only 2025-01-03 has a return on both sides.
    expect(r.n).toBe(1);
    expect(r.beta).toBeNull();
  });
});

describe("rollingVolatility and anomalies", () => {
  it("emits one point per full window", () => {
    const g = growthFrom(Array.from({ length: 10 }, (_, i) => (i % 2 ? 0.01 : -0.01)));
    const roll = rollingVolatility(g, 5);
    expect(roll).toHaveLength(10 - 5 + 1);
    expect(roll[0].value).toBeGreaterThan(0);
  });

  it("flags outsized daily moves without removing them", () => {
    const g = growthFrom([0.02, 0.5, -0.01]);
    const flagged = findAnomalousDays(g, 0.1);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].retPct).toBeCloseTo(50, 6);
  });
});

describe("sliceGrowth and regimes", () => {
  it("re-anchors a window so it starts at 1", () => {
    const g = series([
      ["2025-01-01", 1.0],
      ["2025-01-02", 2.0],
      ["2025-01-03", 3.0],
      ["2025-01-04", 4.0],
    ]);
    const sliced = sliceGrowth(g, "2025-01-03", "2025-01-04");
    // Anchored on the 2025-01-02 close of 2.0.
    expect(sliced[0].growthOfDollar).toBeCloseTo(1, 9);
    expect(sliced[sliced.length - 1].growthOfDollar).toBeCloseTo(2, 9);
  });

  it("computes a stat block and benchmark relation per regime", () => {
    const g = growthFrom(Array.from({ length: 40 }, (_, i) => (i % 3 ? 0.004 : -0.003)));
    const b = growthFrom(Array.from({ length: 40 }, (_, i) => (i % 3 ? 0.003 : -0.002)));
    const slices = computeRegimeSlices(
      [
        { label: "early", from: "2025-01-01", to: "2025-01-20" },
        { label: "late", from: "2025-01-21", to: "2025-12-31" },
      ],
      g,
      { SPY: b }
    );

    expect(slices).toHaveLength(2);
    expect(slices[0].label).toBe("early");
    expect(slices[0].benchmarks[0].symbol).toBe("SPY");
    expect(slices[0].portfolio.n).toBeGreaterThan(0);
    expect(slices[1].portfolio.n).toBeGreaterThan(0);
  });
});
