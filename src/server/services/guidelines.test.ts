import { describe, it, expect } from "vitest";
import {
  evaluateGuidelines,
  type GuidelinesInput,
  type GuidelinesTickerInput,
} from "./guidelines";

function ticker(overrides: Partial<GuidelinesTickerInput> = {}): GuidelinesTickerInput {
  return {
    ticker: "NVDA",
    bucket: "active",
    targetWeightPct: 4.5,
    realWeightPct: 4.5,
    ...overrides,
  };
}

/** Cash and options exactly on policy so they don't pollute unrelated tests. */
const NEUTRAL = {
  cash: { modelTargetPct: 5, realPct: 5 },
  options: { openPremiumAtCostPct: 0 },
};

function run(
  tickers: GuidelinesTickerInput[],
  extra: Partial<Omit<GuidelinesInput, "tickers">> = {},
) {
  return evaluateGuidelines({ tickers, ...NEUTRAL, ...extra });
}

function codes(result: ReturnType<typeof evaluateGuidelines>) {
  return result.violations.map((v) => v.code);
}

describe("bucket drift band (±5 abs pts, exclusive)", () => {
  it("does not flag the core at exactly 5 pts off target", () => {
    const result = run([
      ticker({ ticker: "VTI", bucket: "core", targetWeightPct: 57, realWeightPct: 52 }),
    ]);
    expect(codes(result)).not.toContain("bucket_drift");
    const rollup = result.rollups.find((r) => r.bucket === "core");
    expect(rollup?.driftAbsPts).toBe(-5);
    expect(rollup?.bandBreach).toBe(false);
  });

  it("flags the core just past 5 pts off target", () => {
    const result = run([
      ticker({ ticker: "VTI", bucket: "core", targetWeightPct: 57, realWeightPct: 51.9 }),
    ]);
    const drift = result.violations.find((v) => v.code === "bucket_drift");
    expect(drift?.bucket).toBe("core");
  });

  it("computes no drift when no row in the bucket is priced", () => {
    const result = run([
      ticker({ ticker: "VTI", bucket: "core", targetWeightPct: 57, realWeightPct: null }),
    ]);
    const rollup = result.rollups.find((r) => r.bucket === "core");
    expect(rollup?.realPct).toBeNull();
    expect(rollup?.bandBreach).toBe(false);
    expect(codes(result)).not.toContain("bucket_drift");
  });
});

describe("per-name weight limits (active sleeve only)", () => {
  it("does not flag a name at exactly the 8% hard cap", () => {
    const result = run([ticker({ realWeightPct: 8 })]);
    expect(codes(result)).not.toContain("name_over_cap");
  });

  it("flags a name just past the 8% hard cap", () => {
    const result = run([ticker({ realWeightPct: 8.1 })]);
    const cap = result.violations.find((v) => v.code === "name_over_cap");
    expect(cap?.ticker).toBe("NVDA");
    expect(cap?.severity).toBe("warn");
  });

  it("does not flag a name at exactly the 3% minimum", () => {
    const result = run([ticker({ realWeightPct: 3 })]);
    expect(codes(result)).not.toContain("name_below_min");
  });

  it("flags a name just below the 3% minimum as a decision demand", () => {
    const result = run([ticker({ realWeightPct: 2.9 })]);
    const min = result.violations.find((v) => v.code === "name_below_min");
    expect(min?.ticker).toBe("NVDA");
    expect(min?.severity).toBe("info");
  });

  it("applies no per-name rules to core rows or unpriced rows", () => {
    const result = run([
      ticker({ ticker: "VTI", bucket: "core", targetWeightPct: 30, realWeightPct: 2 }),
      ticker({ ticker: "NOPRICE", realWeightPct: null }),
    ]);
    expect(codes(result)).not.toContain("name_over_cap");
    expect(codes(result)).not.toContain("name_below_min");
  });
});

describe("unbucketed rows", () => {
  it("flags every ticker row without a bucket and skips its name rules", () => {
    const result = run([
      ticker({ ticker: "TSM", bucket: null, targetWeightPct: 2, realWeightPct: 9 }),
    ]);
    const unbucketed = result.violations.filter((v) => v.code === "unbucketed");
    expect(unbucketed).toHaveLength(1);
    expect(unbucketed[0].ticker).toBe("TSM");
    expect(codes(result)).not.toContain("name_over_cap");
  });

  it("excludes unbucketed weight from bucket rollups", () => {
    const result = run([
      ticker({ ticker: "A", targetWeightPct: 35, realWeightPct: 40 }),
      ticker({ ticker: "B", bucket: null, targetWeightPct: 0, realWeightPct: 10 }),
    ]);
    const rollup = result.rollups.find((r) => r.bucket === "active");
    expect(rollup?.realPct).toBe(40);
    expect(rollup?.nameCount).toBe(1);
  });
});

describe("active name-count caps (6–8)", () => {
  function names(count: number) {
    return Array.from({ length: count }, (_, i) =>
      ticker({ ticker: `T${i}`, targetWeightPct: 4, realWeightPct: 4 }),
    );
  }

  it("warns above 8 names (9)", () => {
    const result = run(names(9));
    const breach = result.violations.find((v) => v.code === "count_breach");
    expect(breach?.severity).toBe("warn");
    expect(breach?.delta).toBe(1);
  });

  it("informs below 6 names (5)", () => {
    const result = run(names(5));
    const breach = result.violations.find((v) => v.code === "count_breach");
    expect(breach?.severity).toBe("info");
    expect(breach?.delta).toBe(-1);
  });

  it("stays silent inside the range and for an empty sleeve", () => {
    expect(codes(run(names(7)))).not.toContain("count_breach");
    expect(codes(run([]))).not.toContain("count_breach");
  });
});

describe("options budget (3% ceiling)", () => {
  it("does not flag premium at exactly the budget", () => {
    const result = run([], { options: { openPremiumAtCostPct: 3 } });
    expect(codes(result)).not.toContain("options_over_budget");
    const rollup = result.rollups.find((r) => r.bucket === "options");
    expect(rollup?.bandBreach).toBe(false);
  });

  it("flags premium over the budget", () => {
    const result = run([], { options: { openPremiumAtCostPct: 3.4 } });
    const over = result.violations.find((v) => v.code === "options_over_budget");
    expect(over?.severity).toBe("warn");
    expect(over?.delta).toBeCloseTo(0.4, 10);
  });

  it("reports an unknown premium as null without violating", () => {
    const result = run([], { options: { openPremiumAtCostPct: null } });
    expect(codes(result)).not.toContain("options_over_budget");
    const rollup = result.rollups.find((r) => r.bucket === "options");
    expect(rollup?.realPct).toBeNull();
  });

  it("never flags under-deployment of the options budget", () => {
    const result = run([], { options: { openPremiumAtCostPct: 0 } });
    expect(codes(result)).not.toContain("options_over_budget");
  });
});

describe("cash band and model-policy gaps", () => {
  it("flags the current live divergence: cash model 16.5 vs policy 5", () => {
    const result = run([], { cash: { modelTargetPct: 16.5, realPct: 15.6 } });
    expect(codes(result)).toContain("cash_band"); // 10.6 pts over policy
    const gap = result.violations.find(
      (v) => v.code === "model_policy_gap" && v.bucket === "cash",
    );
    expect(gap?.delta).toBe(11.5);
  });

  it("stays silent when cash sits on policy", () => {
    const result = run([]);
    expect(codes(result)).not.toContain("cash_band");
    expect(
      result.violations.find(
        (v) => v.code === "model_policy_gap" && v.bucket === "cash",
      ),
    ).toBeUndefined();
  });

  it("flags a bucket whose model targets do not sum to the policy target", () => {
    const result = run([
      ticker({ ticker: "VTI", bucket: "core", targetWeightPct: 34, realWeightPct: 34 }),
      ticker({ ticker: "VXUS", bucket: "core", targetWeightPct: 18, realWeightPct: 18 }),
    ]);
    const gap = result.violations.find(
      (v) => v.code === "model_policy_gap" && v.bucket === "core",
    );
    expect(gap?.delta).toBe(-5); // 52 vs 57
  });

  it("tolerates sub-0.5pt rounding gaps", () => {
    const result = run([
      ticker({ ticker: "VTI", bucket: "core", targetWeightPct: 34.2, realWeightPct: 34 }),
      ticker({ ticker: "VXUS", bucket: "core", targetWeightPct: 22.6, realWeightPct: 22.6 }),
    ]);
    expect(
      result.violations.find(
        (v) => v.code === "model_policy_gap" && v.bucket === "core",
      ),
    ).toBeUndefined();
  });
});

describe("rollup shape", () => {
  it("always returns core, active, options, cash in order", () => {
    const result = run([]);
    expect(result.rollups.map((r) => r.bucket)).toEqual([
      "core",
      "active",
      "options",
      "cash",
    ]);
  });
});
