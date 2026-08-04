import { describe, it, expect } from "vitest";
import {
  ACTIVE_KILL_SWITCH,
  ADD_RULES,
  ADMISSION_RULES,
  BUCKET_TARGETS,
  CASH_TARGET_WEIGHT,
  CRASH_DEFINITIONS,
  CRASH_PROTOCOL,
  NAME_COUNTS,
  NAME_WEIGHT_LIMITS,
  OPTIONS_BUDGET_PCT,
  OPTIONS_SPEC,
  POLICY_BUCKETS,
  REBALANCE_BANDS,
  SECTOR_CAP_PTS_OF_BOOK,
  SIZING_LADDER,
  THESIS_HORIZON_YEARS,
  deriveTargetWeight,
  reconcileActiveTargets,
} from "./policy";

describe("policy constants (v3)", () => {
  it("bucket targets plus cash plus options budget sum to exactly 100", () => {
    const bucketSum = POLICY_BUCKETS.reduce(
      (sum, bucket) => sum + BUCKET_TARGETS[bucket],
      0,
    );
    expect(bucketSum + CASH_TARGET_WEIGHT + OPTIONS_BUDGET_PCT).toBe(100);
  });

  it("matches the agreed 57/35/3/5 split", () => {
    expect(BUCKET_TARGETS.core).toBe(57);
    expect(BUCKET_TARGETS.active).toBe(35);
    expect(OPTIONS_BUDGET_PCT).toBe(3);
    expect(CASH_TARGET_WEIGHT).toBe(5);
  });

  it("keeps the agreed name-weight limits and the 6–8 count", () => {
    expect(NAME_WEIGHT_LIMITS).toEqual({ minPct: 3, hardCapPct: 8 });
    expect(NAME_COUNTS.active).toEqual({ min: 6, max: 8 });
  });

  it("keeps the bucket rebalance band at 5 absolute points", () => {
    expect(REBALANCE_BANDS.bucketAbsPts).toBe(5);
  });

  it("a full sleeve fits inside the active budget", () => {
    // min names × smallest rung must not exceed the bucket, and the ladder's
    // largest rung must stay under the hard cap
    expect(NAME_COUNTS.active.min * SIZING_LADDER.active[3]).toBeLessThanOrEqual(
      BUCKET_TARGETS.active,
    );
    expect(SIZING_LADDER.active[5]).toBeLessThan(NAME_WEIGHT_LIMITS.hardCapPct);
  });

  it("sector cap fits two top-conviction names but not three", () => {
    expect(SECTOR_CAP_PTS_OF_BOOK).toBeGreaterThanOrEqual(2 * SIZING_LADDER.active[5]);
    expect(SECTOR_CAP_PTS_OF_BOOK).toBeLessThan(3 * SIZING_LADDER.active[5]);
    // 40% of the sleeve
    expect(SECTOR_CAP_PTS_OF_BOOK).toBe(BUCKET_TARGETS.active * 0.4);
  });

  it("pins the admission and add rules", () => {
    expect(ADMISSION_RULES).toEqual({
      coolingPeriodDays: 7,
      maxNewNamesPerQuarter: 2,
      displacementRequiredAtMaxCount: true,
    });
    expect(ADD_RULES.maxAddDownsPerPosition).toBe(1);
    expect(ADD_RULES.crashCarveOutMaxDrawdownVsSpy).toBe(1.25);
  });

  it("pins the 1–3 year active thesis horizon", () => {
    expect(THESIS_HORIZON_YEARS).toEqual({ min: 1, max: 3 });
  });

  it("pins the options spec to the IPS Part V numbers", () => {
    expect(OPTIONS_SPEC.instruments).toEqual(["long_call", "call_debit_spread"]);
    expect(OPTIONS_SPEC.minTenorMonths).toBe(12);
    expect(OPTIONS_SPEC.maxPremiumPerPositionPct).toBe(1);
    expect(OPTIONS_SPEC.annualPremiumBudgetPct).toBe(OPTIONS_BUDGET_PCT);
    expect(OPTIONS_SPEC.realizedGainsRecycle).toBe(false);
  });

  it("crash protocol has escalating SPY drawdown triggers and defined terms", () => {
    const levels = CRASH_PROTOCOL.map((s) => s.spyDrawdownPct);
    expect(levels).toEqual([-20, -30, -40]);
    for (const step of CRASH_PROTOCOL) {
      expect(step.action.length).toBeGreaterThan(0);
    }
    expect(CRASH_DEFINITIONS.activationDrawdownPct).toBe(CRASH_PROTOCOL[0].spyDrawdownPct);
    expect(CRASH_DEFINITIONS.recoveredWithinPctOfHigh).toBe(10);
  });

  it("pins the active kill switch", () => {
    expect(ACTIVE_KILL_SWITCH).toEqual({
      benchmark: "VT",
      rollingWindowMonths: 24,
      failShiftPts: 10,
      secondFailActiveCapPct: 20,
    });
    // one failed test still leaves a functioning sleeve above the second-fail cap
    expect(BUCKET_TARGETS.active - ACTIVE_KILL_SWITCH.failShiftPts).toBeGreaterThan(
      ACTIVE_KILL_SWITCH.secondFailActiveCapPct,
    );
  });
});

describe("deriveTargetWeight — active ladder", () => {
  it("maps conviction 5 to 5.5", () => {
    expect(deriveTargetWeight("active", 5)).toBe(5.5);
  });

  it("maps conviction 4 to 4.5", () => {
    expect(deriveTargetWeight("active", 4)).toBe(4.5);
  });

  it("maps conviction 3 to 3.5", () => {
    expect(deriveTargetWeight("active", 3)).toBe(3.5);
  });

  it("returns null below conviction 3 (no slot)", () => {
    expect(deriveTargetWeight("active", 2)).toBeNull();
    expect(deriveTargetWeight("active", 1)).toBeNull();
  });

  it("every rung clears the 3% minimum", () => {
    // a fresh ladder-sized position must never spawn an immediate below-min violation
    expect(SIZING_LADDER.active[3]).toBeGreaterThanOrEqual(NAME_WEIGHT_LIMITS.minPct);
  });
});

describe("deriveTargetWeight — cut and core", () => {
  it("returns 0 for a cut, in any bucket", () => {
    expect(deriveTargetWeight("active", 5, { keepDecision: "cut" })).toBe(0);
    expect(deriveTargetWeight("core", 3, { keepDecision: "cut" })).toBe(0);
  });

  it("returns null for the passive core (band-rebalanced, no ladder)", () => {
    expect(deriveTargetWeight("core", 5)).toBeNull();
    expect(deriveTargetWeight("core", 3)).toBeNull();
  });
});

describe("reconcileActiveTargets — bucket binds over ladder", () => {
  it("leaves weights untouched when the ladder sum fits the bucket", () => {
    const weights = [5.5, 4.5, 4.5, 3.5, 3.5, 3.5]; // 25
    expect(reconcileActiveTargets(weights)).toEqual(weights);
  });

  it("scales pro-rata to exactly the bucket when the ladder oversubscribes", () => {
    const weights = Array.from({ length: 8 }, () => 5.5); // 44 > 35
    const scaled = reconcileActiveTargets(weights);
    const sum = scaled.reduce((a, w) => a + w, 0);
    expect(sum).toBeCloseTo(BUCKET_TARGETS.active, 1);
    // proportions preserved: all equal in, all equal out
    expect(new Set(scaled).size).toBe(1);
    expect(scaled[0]).toBeLessThan(5.5);
  });

  it("preserves relative ordering when scaling mixed convictions", () => {
    const scaled = reconcileActiveTargets([5.5, 5.5, 5.5, 5.5, 4.5, 4.5, 3.5, 3.5]); // 37
    expect(scaled[0]).toBeGreaterThan(scaled[4]);
    expect(scaled[4]).toBeGreaterThan(scaled[6]);
    expect(scaled.reduce((a, w) => a + w, 0)).toBeCloseTo(BUCKET_TARGETS.active, 1);
  });

  it("returns a copy, never the input array", () => {
    const weights = [3.5];
    expect(reconcileActiveTargets(weights)).not.toBe(weights);
  });

  it("handles an empty sleeve", () => {
    expect(reconcileActiveTargets([])).toEqual([]);
  });
});
