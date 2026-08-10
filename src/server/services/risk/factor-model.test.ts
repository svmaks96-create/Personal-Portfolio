import { describe, expect, it } from "vitest";
import {
  computeFactorModel,
  FACTOR_SPECS,
} from "@/server/services/risk/factor-model";
import type { DailyReturn } from "@/server/services/risk-metrics";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function gaussFrom(rand: () => number): () => number {
  return () => {
    const u = Math.max(rand(), 1e-12);
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

function dates(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `2024-D${String(1000 + i)}`);
}

function series(ds: string[], values: number[]): DailyReturn[] {
  return ds.map((date, i) => ({ date, ret: values[i] }));
}

/**
 * Synthetic world with known structure:
 *   SPY  = market
 *   SOXX = 1.3·SPY + semis (independent)
 *   IGV  = 1.1·SPY + software (independent)
 *   TLT  = independent rates factor
 * so the orthogonalized factors recover: SPY, semis·1, software·1, rates.
 */
function syntheticWorld(t: number, seed: number) {
  const gauss = gaussFrom(lcg(seed));
  const ds = dates(t);
  const market = Array.from({ length: t }, () => gauss() * 0.011);
  const semis = Array.from({ length: t }, () => gauss() * 0.012);
  const software = Array.from({ length: t }, () => gauss() * 0.009);
  const rates = Array.from({ length: t }, () => gauss() * 0.006);

  const factorReturns = {
    SPY: series(ds, market),
    SOXX: series(ds, market.map((m, i) => 1.3 * m + semis[i])),
    IGV: series(ds, market.map((m, i) => 1.1 * m + software[i])),
    TLT: series(ds, rates),
  };
  return { ds, market, semis, software, rates, factorReturns, gauss };
}

describe("computeFactorModel", () => {
  it("recovers known betas and a zero alpha verdict", () => {
    const t = 750;
    const { ds, market, semis, software, rates, factorReturns, gauss } =
      syntheticWorld(t, 20240101);

    // Portfolio: beta 1.2 to market, 0.6 to the semis factor, 0.3 software,
    // -0.2 rates, no alpha, small idiosyncratic noise.
    const y = Array.from({ length: t }, (_, i) =>
      1.2 * market[i] +
      0.6 * semis[i] +
      0.3 * software[i] -
      0.2 * rates[i] +
      gauss() * 0.002
    );

    const model = computeFactorModel(series(ds, y), factorReturns)!;
    expect(model).not.toBeNull();
    expect(model.observations).toBe(t);

    const byticker = Object.fromEntries(model.loadings.map((l) => [l.symbol, l]));
    // The portfolio loads on the *pure* semis/software factors, so its total
    // market beta is the direct 1.2 — which the SPY column must recover.
    expect(byticker.SPY.beta).toBeCloseTo(1.2, 1);
    // SOXX⊥ carries the semis tilt (β 0.6), IGV⊥ software (0.3), TLT rates (−0.2).
    expect(byticker.SOXX.beta).toBeCloseTo(0.6, 1);
    expect(byticker.IGV.beta).toBeCloseTo(0.3, 1);
    expect(byticker.TLT.beta).toBeCloseTo(-0.2, 1);

    // Nearly all variance is factor-driven.
    expect(model.r2Pct).toBeGreaterThan(90);
    const shareSum = model.loadings.reduce((a, l) => a + l.varianceSharePct, 0);
    expect(Math.abs(shareSum - model.r2Pct)).toBeLessThan(2);

    // True alpha is zero — the verdict must say indistinguishable.
    expect(model.alphaDistinguishable).toBe(false);
    expect(model.alphaCiLowPct).toBeLessThan(0);
    expect(model.alphaCiHighPct).toBeGreaterThan(0);
  });

  it("detects a large genuine alpha", () => {
    const t = 750;
    const { ds, market, factorReturns, gauss } = syntheticWorld(t, 77);
    const dailyAlpha = 0.0012; // ~30%/yr — large on purpose.
    const y = Array.from({ length: t }, (_, i) =>
      dailyAlpha + 1.0 * market[i] + gauss() * 0.003
    );
    const model = computeFactorModel(series(ds, y), factorReturns)!;
    expect(model.alphaAnnualPct).toBeGreaterThan(15);
    expect(model.alphaDistinguishable).toBe(true);
    expect(model.alphaCiLowPct).toBeGreaterThan(0);
  });

  it("returns null below the observation floor and on missing factor data", () => {
    const { ds, market, factorReturns } = syntheticWorld(40, 5);
    expect(
      computeFactorModel(series(ds, market), factorReturns)
    ).toBeNull();

    const longer = syntheticWorld(200, 6);
    expect(
      computeFactorModel(series(longer.ds, longer.market), {
        SPY: longer.factorReturns.SPY,
        // SOXX/IGV/TLT missing entirely → no aligned dates.
      })
    ).toBeNull();
  });

  it("reports beta drift between window halves", () => {
    const t = 600;
    const { ds, market, factorReturns, gauss } = syntheticWorld(t, 99);
    // Market beta 0.5 in the first half, 1.5 in the second.
    const y = Array.from({ length: t }, (_, i) =>
      (i < t / 2 ? 0.5 : 1.5) * market[i] + gauss() * 0.002
    );
    const model = computeFactorModel(series(ds, y), factorReturns)!;
    const spyDrift = model.drift.find((d) => d.symbol === "SPY")!;
    expect(spyDrift.firstHalfBeta!).toBeLessThan(0.8);
    expect(spyDrift.secondHalfBeta!).toBeGreaterThan(1.2);
  });

  it("factor spec order is the declared orthogonalization order", () => {
    expect(FACTOR_SPECS.map((f) => f.symbol)).toEqual([
      "SPY",
      "SOXX",
      "IGV",
      "TLT",
    ]);
  });
});
