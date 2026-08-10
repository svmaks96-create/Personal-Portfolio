import { describe, it, expect } from "vitest";
import {
  computeEpsRevision,
  computeQuantScores,
  momentum12m1m,
  percentileRanks,
  type QuantMetricsInput,
} from "./quant-score";

function company(
  ticker: string,
  overrides: Partial<QuantMetricsInput> = {},
): QuantMetricsInput {
  return {
    ticker,
    sector: null,
    peTtm: null,
    fwdPe: null,
    pfcfTtm: null,
    evEbitdaTtm: null,
    psTtm: null,
    pbTtm: null,
    roicTtm: null,
    netMarginTtm: null,
    debtToEquityTtm: null,
    incomeQualityTtm: null,
    epsChangeYieldFwd: null,
    epsRevision: null,
    priceChange12m1m: null,
    ...overrides,
  };
}

describe("percentileRanks", () => {
  it("ranks 0–100 preserving order", () => {
    expect(percentileRanks([10, 20, 30, 40, 50])).toEqual([
      0, 25, 50, 75, 100,
    ]);
  });

  it("passes nulls through and ranks the rest", () => {
    const ranks = percentileRanks([10, null, 30, 50]);
    expect(ranks[1]).toBeNull();
    expect(ranks[0]).toBe(0);
    expect(ranks[3]).toBe(100);
    expect(ranks[2]).toBe(50);
  });

  it("gives tied values the mean rank", () => {
    const ranks = percentileRanks([10, 20, 20, 30]);
    expect(ranks[0]).toBe(0);
    expect(ranks[3]).toBe(100);
    // Two 20s share ranks 1 and 2 → mean 1.5 → 50.
    expect(ranks[1]).toBeCloseTo(50, 10);
    expect(ranks[2]).toBeCloseTo(50, 10);
  });

  it("is outlier-immune: an absurd value claims one rank slot, nothing more", () => {
    const base = Array.from({ length: 100 }, (_, i) => i);
    const ranks = percentileRanks([...base, 1_000_000]);
    // The outlier is simply the top rank; it cannot stretch anyone's scale.
    expect(ranks[100]).toBe(100);
    expect(ranks[99]).toBe(99);
    expect(ranks[0]).toBe(0);
  });

  it("single value ranks 50; all-null stays all-null", () => {
    expect(percentileRanks([42])).toEqual([50]);
    expect(percentileRanks([null, null])).toEqual([null, null]);
  });
});

describe("computeQuantScores", () => {
  it("is deterministic on a fixture universe and ranks cheap/quality/momentum highest", () => {
    const universe = [
      company("CHEAP", {
        fwdPe: 8,
        pfcfTtm: 10,
        evEbitdaTtm: 6,
        psTtm: 1,
        roicTtm: 0.3,
        netMarginTtm: 0.25,
        debtToEquityTtm: 0.2,
        epsChangeYieldFwd: 0.03,
        priceChange12m1m: 30,
      }),
      company("MID", {
        fwdPe: 20,
        pfcfTtm: 25,
        evEbitdaTtm: 15,
        psTtm: 5,
        roicTtm: 0.15,
        netMarginTtm: 0.12,
        debtToEquityTtm: 0.8,
        epsChangeYieldFwd: 0.01,
        priceChange12m1m: 8,
      }),
      company("RICH", {
        fwdPe: 60,
        pfcfTtm: 80,
        evEbitdaTtm: 40,
        psTtm: 20,
        roicTtm: 0.05,
        netMarginTtm: 0.03,
        debtToEquityTtm: 2.5,
        epsChangeYieldFwd: -0.005,
        priceChange12m1m: -20,
      }),
    ];

    const scores = computeQuantScores(universe);
    const byTicker = new Map(scores.map((s) => [s.ticker, s]));

    expect(byTicker.get("CHEAP")).toEqual({
      ticker: "CHEAP",
      valueScore: 100,
      growthScore: 100,
      qualityScore: 100,
      momentumScore: 100,
      compositeScore: 100,
    });
    expect(byTicker.get("RICH")?.compositeScore).toBe(0);
    expect(byTicker.get("MID")?.compositeScore).toBe(50);

    // Deterministic: same input, same output.
    expect(computeQuantScores(universe)).toEqual(scores);
  });

  it("renormalizes on missing metrics instead of zeroing them", () => {
    const universe = [
      // No FCF/EV/PS data — value factor rests on earnings yield alone.
      company("A", { fwdPe: 10, priceChange12m1m: 10 }),
      company("B", { fwdPe: 20, priceChange12m1m: -10 }),
    ];
    const [a, b] = computeQuantScores(universe);
    expect(a.valueScore).toBe(100);
    expect(b.valueScore).toBe(0);
    // Growth/quality entirely missing → only 2 factors available. Factors
    // renormalize, but the COMPOSITE is gated at ≥3 — a two-factor name is on
    // a different ruler and must not compete with fully-scored names.
    expect(a.growthScore).toBeNull();
    expect(a.qualityScore).toBeNull();
    expect(a.compositeScore).toBeNull();
    expect(b.compositeScore).toBeNull();
  });

  it("computes the composite once ≥3 factors are present", () => {
    const universe = [
      company("A", { fwdPe: 10, roicTtm: 0.3, priceChange12m1m: 10 }),
      company("B", { fwdPe: 20, roicTtm: 0.1, priceChange12m1m: -10 }),
    ];
    const [a, b] = computeQuantScores(universe);
    expect(a.growthScore).toBeNull();
    expect(a.compositeScore).toBe(100);
    expect(b.compositeScore).toBe(0);
  });

  it("falls back from fwdPe to peTtm for the earnings yield", () => {
    const universe = [
      company("FWD", { fwdPe: 10 }),
      company("TTM", { peTtm: 5 }),
    ];
    const [fwd, ttm] = computeQuantScores(universe);
    // 1/5 > 1/10 → TTM ranks above FWD on value.
    expect(ttm.valueScore).toBe(100);
    expect(fwd.valueScore).toBe(0);
  });

  it("ranks lower leverage higher and negative momentum lower", () => {
    const universe = [
      company("LEAN", { debtToEquityTtm: 0.1, priceChange12m1m: 12 }),
      company("LEVERED", { debtToEquityTtm: 3.0, priceChange12m1m: -25 }),
    ];
    const [lean, levered] = computeQuantScores(universe);
    expect(lean.qualityScore).toBe(100);
    expect(levered.qualityScore).toBe(0);
    expect(lean.momentumScore).toBe(100);
    expect(levered.momentumScore).toBe(0);
  });

  it("derives 12-minus-1 momentum from the 1Y and 1M windows", () => {
    // Flat year with a +20% last-month spike → NEGATIVE 12-1 (reversal
    // exposure compounded out); flat year with a −10% last month → positive.
    expect(momentum12m1m(20, 20)).toBeCloseTo(0, 10);
    expect(momentum12m1m(0, 20)).toBeCloseTo(-16.6667, 3);
    expect(momentum12m1m(0, -10)).toBeCloseTo(11.1111, 3);
    // Missing windows or a total-loss month → null, never Infinity.
    expect(momentum12m1m(null, 5)).toBeNull();
    expect(momentum12m1m(30, null)).toBeNull();
    expect(momentum12m1m(30, -100)).toBeNull();
  });

  it("returns all-null scores for a metrics-free ticker and [] for empty input", () => {
    const [ghost] = computeQuantScores([company("GHOST")]);
    expect(ghost.compositeScore).toBeNull();
    expect(ghost.valueScore).toBeNull();
    expect(computeQuantScores([])).toEqual([]);
  });

  it("blends estimate revisions into growth when history exists", () => {
    const universe = [
      company("UP", { epsChangeYieldFwd: 0.01, epsRevision: 0.08 }),
      company("DOWN", { epsChangeYieldFwd: 0.01, epsRevision: -0.06 }),
      company("NOHIST", { epsChangeYieldFwd: 0.01 }),
    ];
    const [up, down, nohist] = computeQuantScores(universe);
    // Identical change yield (three-way tie at 50); revisions split UP/DOWN
    // while the history-less name renormalizes to its change yield alone.
    expect(up.growthScore).toBeGreaterThan(50);
    expect(down.growthScore).toBeLessThan(50);
    expect(nohist.growthScore).toBe(50);
  });

  it("nulls leverage on negative book equity instead of ranking it best", () => {
    const universe = [
      company("LEAN", { debtToEquityTtm: 0.1 }),
      company("LEVERED", { debtToEquityTtm: 3.0 }),
      // Negative D/E = negative equity — the old negation bug ranked this
      // as the LEAST levered name in the universe.
      company("GUTTED", { debtToEquityTtm: -5.0 }),
      // Negative P/B alone also flags negative equity.
      company("GUTTED2", { debtToEquityTtm: 2.0, pbTtm: -1.5 }),
    ];
    const scores = computeQuantScores(universe);
    const byTicker = new Map(scores.map((s) => [s.ticker, s]));
    expect(byTicker.get("LEAN")?.qualityScore).toBe(100);
    expect(byTicker.get("LEVERED")?.qualityScore).toBe(0);
    expect(byTicker.get("GUTTED")?.qualityScore).toBeNull();
    expect(byTicker.get("GUTTED2")?.qualityScore).toBeNull();

    // Income quality is part of the quality factor.
    const [clean, stuffed] = computeQuantScores([
      company("CLEAN", { incomeQualityTtm: 1.3 }),
      company("STUFFED", { incomeQualityTtm: 0.4 }),
    ]);
    expect(clean.qualityScore).toBe(100);
    expect(stuffed.qualityScore).toBe(0);
  });
});

describe("sector-relative ranking", () => {
  it("ranks value against sector peers when the group is big enough", () => {
    // Globally every bank is cheaper than every tech name — universe-wide
    // ranking would top-rank all banks. Sector-relative, the cheapest tech
    // name is 100 within Technology.
    const tech = Array.from({ length: 10 }, (_, i) =>
      company(`T${i}`, { sector: "Technology", peTtm: 30 + 2 * i }),
    );
    const banks = Array.from({ length: 10 }, (_, i) =>
      company(`F${i}`, { sector: "Financial Services", peTtm: 5 + i }),
    );
    const scores = computeQuantScores([...tech, ...banks]);
    const byTicker = new Map(scores.map((s) => [s.ticker, s]));
    expect(byTicker.get("T0")?.valueScore).toBe(100);
    expect(byTicker.get("T9")?.valueScore).toBe(0);
    expect(byTicker.get("F0")?.valueScore).toBe(100);
  });

  it("falls back to universe-wide ranks for small sector groups", () => {
    const universe = [
      company("T0", { sector: "Technology", peTtm: 30 }),
      company("T1", { sector: "Technology", peTtm: 40 }),
      company("F0", { sector: "Financial Services", peTtm: 5 }),
      company("F1", { sector: "Financial Services", peTtm: 10 }),
    ];
    const scores = computeQuantScores(universe);
    const byTicker = new Map(scores.map((s) => [s.ticker, s]));
    // Groups of 2 are under the minimum — global ordering applies.
    expect(byTicker.get("F0")?.valueScore).toBe(100);
    expect(byTicker.get("T1")?.valueScore).toBe(0);
    expect(byTicker.get("T0")?.valueScore).toBeCloseTo(33.33, 1);
  });

  it("swaps EV/EBITDA and FCF yield for book yield in financial sectors", () => {
    // EV/EBITDA ordering FAVORS F9 — if it leaked into the value factor,
    // F0 could not be the top value name on book yield alone.
    const fins = Array.from({ length: 10 }, (_, i) =>
      company(`F${i}`, {
        sector: "Financial Services",
        pbTtm: 1 + 0.5 * i,
        evEbitdaTtm: 100 - i,
        pfcfTtm: 100 - i,
      }),
    );
    const scores = computeQuantScores(fins);
    const byTicker = new Map(scores.map((s) => [s.ticker, s]));
    expect(byTicker.get("F0")?.valueScore).toBe(100);
    expect(byTicker.get("F9")?.valueScore).toBe(0);
  });

  it("does not use P/B outside financial sectors", () => {
    const universe = [
      company("A", { sector: "Technology", pbTtm: 1 }),
      company("B", { sector: "Technology", pbTtm: 50 }),
    ];
    const [a, b] = computeQuantScores(universe);
    expect(a.valueScore).toBeNull();
    expect(b.valueScore).toBeNull();
  });
});

describe("computeEpsRevision", () => {
  it("computes percent change vs the prior snapshot of the same fiscal year", () => {
    const now = { epsAvg: 11, date: "2027-06-30" };
    const prior = { epsAvg: 10, date: "2027-06-30" };
    expect(computeEpsRevision(now, prior)).toBeCloseTo(0.1, 10);
  });

  it("is sign-safe for negative prior estimates", () => {
    // −2 → −1 is an UPWARD revision: (−1 − (−2)) / |−2| = +0.5.
    const now = { epsAvg: -1, date: "2027-06-30" };
    const prior = { epsAvg: -2, date: "2027-06-30" };
    expect(computeEpsRevision(now, prior)).toBeCloseTo(0.5, 10);
  });

  it("returns null across fiscal-year rollovers, zero priors, and missing sides", () => {
    const now = { epsAvg: 11, date: "2028-06-30" };
    expect(computeEpsRevision(now, { epsAvg: 10, date: "2027-06-30" })).toBeNull();
    expect(
      computeEpsRevision(
        { epsAvg: 11, date: "2027-06-30" },
        { epsAvg: 0, date: "2027-06-30" },
      ),
    ).toBeNull();
    expect(computeEpsRevision(null, { epsAvg: 10, date: "2027-06-30" })).toBeNull();
    expect(computeEpsRevision(now, null)).toBeNull();
  });
});
