import { describe, expect, it } from "vitest";
import {
  buildCommonSample,
  estimateCovariance,
  ledoitWolfShrinkage,
} from "@/server/services/risk/covariance";
import { TRADING_DAYS_PER_YEAR, type DailyReturn } from "@/server/services/risk-metrics";

/** Deterministic pseudo-random source — tests must not use Math.random. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function series(dates: string[], rets: number[]): DailyReturn[] {
  return dates.map((date, i) => ({ date, ret: rets[i] }));
}

function tradingDates(count: number): string[] {
  // Synthetic weekday-ish calendar; only ordering matters to the estimator.
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const day = String(100 + i);
    out.push(`2024-D${day}`);
  }
  return out;
}

/**
 * Correlated return panel: asset i = beta_i * common + idiosyncratic noise.
 * Gives a realistic covariance structure with a known dominant factor.
 */
function correlatedPanel(
  n: number,
  t: number,
  seed: number
): Record<string, DailyReturn[]> {
  const rand = lcg(seed);
  const gauss = () => {
    // Box-Muller from two uniforms.
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const dates = tradingDates(t);
  const common = Array.from({ length: t }, () => gauss() * 0.015);
  const out: Record<string, DailyReturn[]> = {};
  for (let i = 0; i < n; i++) {
    const beta = 0.5 + i * 0.15;
    const rets = common.map((c) => beta * c + gauss() * 0.008);
    out[`T${String(i).padStart(2, "0")}`] = series(dates, rets);
  }
  return out;
}

describe("buildCommonSample", () => {
  it("excludes series below the observation minimum and reports them", () => {
    const dates = tradingDates(80);
    const sample = buildCommonSample(
      {
        AAA: series(dates, dates.map(() => 0.01)),
        BBB: series(dates, dates.map(() => -0.01)),
        YOUNG: series(dates.slice(0, 10), Array(10).fill(0.02)),
      },
      60
    );
    expect(sample.tickers).toEqual(["AAA", "BBB"]);
    expect(sample.dates).toHaveLength(80);
    expect(sample.excluded).toHaveLength(1);
    expect(sample.excluded[0].ticker).toBe("YOUNG");
    expect(sample.excluded[0].observations).toBe(10);
  });

  it("intersects onto shared dates only", () => {
    const dates = tradingDates(100);
    const sample = buildCommonSample(
      {
        AAA: series(dates, dates.map(() => 0.01)),
        BBB: series(dates.slice(20), dates.slice(20).map(() => 0.01)),
      },
      60
    );
    expect(sample.dates).toHaveLength(80);
    expect(sample.dates[0]).toBe(dates[20]);
  });

  it("drops the shortest series when the intersection collapses below the minimum", () => {
    const dates = tradingDates(200);
    // DISJOINT overlaps the others on only 30 dates.
    const sample = buildCommonSample(
      {
        AAA: series(dates.slice(0, 150), Array(150).fill(0.01)),
        BBB: series(dates.slice(0, 150), Array(150).fill(0.02)),
        DISJOINT: series(dates.slice(120), Array(80).fill(0.01)),
      },
      60
    );
    expect(sample.tickers).toEqual(["AAA", "BBB"]);
    expect(sample.dates).toHaveLength(150);
    expect(sample.excluded.map((e) => e.ticker)).toEqual(["DISJOINT"]);
  });
});

describe("ledoitWolfShrinkage", () => {
  it("matches an independently-computed sample covariance and target on a small fixture", () => {
    const returns = [
      [0.01, 0.02],
      [-0.02, -0.01],
      [0.015, 0.005],
      [-0.005, 0.01],
    ];
    const result = ledoitWolfShrinkage(returns);

    // Independent S computation (1/T, demeaned).
    const t = returns.length;
    const means = [0, 1].map(
      (i) => returns.reduce((a, r) => a + r[i], 0) / t
    );
    const s = [
      [0, 0],
      [0, 0],
    ];
    for (const row of returns) {
      for (let i = 0; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          s[i][j] += ((row[i] - means[i]) * (row[j] - means[j])) / t;
        }
      }
    }
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(result.sample[i][j]).toBeCloseTo(s[i][j], 12);
      }
    }

    // With N=2 there is one correlation; the target off-diagonal equals it,
    // so shrinkage cannot move the matrix: sigma === sample.
    const rho = s[0][1] / Math.sqrt(s[0][0] * s[1][1]);
    expect(result.avgCorrelation).toBeCloseTo(rho, 12);
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        expect(result.sigma[i][j]).toBeCloseTo(s[i][j], 12);
      }
    }
  });

  it("is a convex combination: sigma = δF + (1−δ)S with δ in [0,1]", () => {
    const panel = correlatedPanel(6, 120, 42);
    const tickers = Object.keys(panel).sort();
    const dates = panel[tickers[0]].map((r) => r.date);
    const returns = dates.map((_, t) => tickers.map((k) => panel[k][t].ret));

    const { sigma, sample, intensity, avgCorrelation } =
      ledoitWolfShrinkage(returns);
    expect(intensity).toBeGreaterThanOrEqual(0);
    expect(intensity).toBeLessThanOrEqual(1);

    for (let i = 0; i < tickers.length; i++) {
      for (let j = 0; j < tickers.length; j++) {
        const target =
          i === j
            ? sample[i][i]
            : avgCorrelation * Math.sqrt(sample[i][i] * sample[j][j]);
        const expected = intensity * target + (1 - intensity) * sample[i][j];
        expect(sigma[i][j]).toBeCloseTo(expected, 12);
      }
    }
  });

  it("pulls extreme correlations toward the average", () => {
    const panel = correlatedPanel(8, 90, 7);
    const tickers = Object.keys(panel).sort();
    const dates = panel[tickers[0]].map((r) => r.date);
    const returns = dates.map((_, t) => tickers.map((k) => panel[k][t].ret));

    const { sigma, sample, intensity, avgCorrelation } =
      ledoitWolfShrinkage(returns);
    expect(intensity).toBeGreaterThan(0);

    // The most extreme sample correlation must move toward rBar.
    let extremeI = 0;
    let extremeJ = 1;
    let extremeDist = -1;
    for (let i = 0; i < tickers.length; i++) {
      for (let j = i + 1; j < tickers.length; j++) {
        const corr = sample[i][j] / Math.sqrt(sample[i][i] * sample[j][j]);
        const dist = Math.abs(corr - avgCorrelation);
        if (dist > extremeDist) {
          extremeDist = dist;
          extremeI = i;
          extremeJ = j;
        }
      }
    }
    const sampleCorr =
      sample[extremeI][extremeJ] /
      Math.sqrt(sample[extremeI][extremeI] * sample[extremeJ][extremeJ]);
    const shrunkCorr =
      sigma[extremeI][extremeJ] /
      Math.sqrt(sigma[extremeI][extremeI] * sigma[extremeJ][extremeJ]);
    expect(Math.abs(shrunkCorr - avgCorrelation)).toBeLessThan(
      Math.abs(sampleCorr - avgCorrelation)
    );
  });
});

describe("estimateCovariance", () => {
  it("annualizes by 252 and reports vols as the diagonal square roots", () => {
    const panel = correlatedPanel(5, 150, 11);
    const estimate = estimateCovariance(panel);
    expect(estimate).not.toBeNull();
    const e = estimate!;
    expect(e.observationCount).toBe(150);
    for (let i = 0; i < e.tickers.length; i++) {
      expect(e.vols[i]).toBeCloseTo(Math.sqrt(e.matrix[i][i]), 12);
    }
    // Daily vol ~1-2% ⇒ annualized vol should land in a sane range.
    for (const vol of e.vols) {
      expect(vol).toBeGreaterThan(0.05);
      expect(vol).toBeLessThan(1);
    }
    // Spot-check annualization against a directly-computed daily variance.
    const first = e.tickers[0];
    const rets = panel[first].map((r) => r.ret);
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const dailyVar =
      rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / rets.length;
    // Shrinkage leaves the diagonal untouched (target shares it).
    expect(e.matrix[0][0]).toBeCloseTo(dailyVar * TRADING_DAYS_PER_YEAR, 10);
  });

  it("produces a positive semi-definite matrix", () => {
    const panel = correlatedPanel(10, 70, 99);
    const e = estimateCovariance(panel)!;
    const n = e.tickers.length;
    // Quadratic form over deterministic probe vectors must be non-negative.
    const rand = lcg(1234);
    for (let probe = 0; probe < 25; probe++) {
      const v = Array.from({ length: n }, () => rand() * 2 - 1);
      let q = 0;
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) q += v[i] * e.matrix[i][j] * v[j];
      }
      expect(q).toBeGreaterThanOrEqual(-1e-10);
    }
    expect(e.psdRepaired).toBe(false);
  });

  it("returns null when nothing survives, and reports exclusions", () => {
    const dates = tradingDates(10);
    expect(
      estimateCovariance({ ONLY: series(dates, Array(10).fill(0.01)) })
    ).toBeNull();

    const panel = correlatedPanel(4, 120, 3);
    panel.YOUNG = series(tradingDates(120).slice(100), Array(20).fill(0.01));
    const e = estimateCovariance(panel)!;
    expect(e.tickers).toHaveLength(4);
    expect(e.excluded.map((x) => x.ticker)).toEqual(["YOUNG"]);
    expect(e.limitingTicker).not.toBeNull();
  });

  it("shrunk correlations stay in [-1, 1] with unit diagonal", () => {
    const panel = correlatedPanel(9, 80, 55);
    const e = estimateCovariance(panel)!;
    for (let i = 0; i < e.tickers.length; i++) {
      expect(e.correlation[i][i]).toBe(1);
      for (let j = 0; j < e.tickers.length; j++) {
        expect(Math.abs(e.correlation[i][j])).toBeLessThanOrEqual(1 + 1e-12);
        expect(e.correlation[i][j]).toBeCloseTo(e.correlation[j][i], 12);
      }
    }
  });
});
