import { describe, it, expect } from "vitest";
import {
  allocationTargetSchema,
  cashTargetWeightSchema,
} from "./allocation-target";

function validTicker(overrides: Record<string, unknown> = {}) {
  return {
    kind: "ticker" as const,
    name: "AAPL",
    targetWeight: 40,
    cashAmountUsd: null,
    ...overrides,
  };
}

function validCash(overrides: Record<string, unknown> = {}) {
  return {
    kind: "cash" as const,
    name: "Schwab Cash",
    targetWeight: 5,
    cashAmountUsd: 5000,
    ...overrides,
  };
}

describe("allocationTargetSchema — ticker", () => {
  it("accepts a valid ticker row", () => {
    const result = allocationTargetSchema.safeParse(validTicker());
    expect(result.success).toBe(true);
  });

  it("uppercases ticker name via transform", () => {
    const result = allocationTargetSchema.safeParse(validTicker({ name: "aapl" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("AAPL");
    }
  });

  it("rejects empty ticker name", () => {
    const result = allocationTargetSchema.safeParse(validTicker({ name: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects negative target weight", () => {
    const result = allocationTargetSchema.safeParse(validTicker({ targetWeight: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects target weight over 100", () => {
    const result = allocationTargetSchema.safeParse(validTicker({ targetWeight: 101 }));
    expect(result.success).toBe(false);
  });

  it("rejects ticker row with non-null cashAmountUsd", () => {
    const result = allocationTargetSchema.safeParse(
      validTicker({ cashAmountUsd: 1000 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts zero target weight on ticker", () => {
    const result = allocationTargetSchema.safeParse(validTicker({ targetWeight: 0 }));
    expect(result.success).toBe(true);
  });
});

describe("allocationTargetSchema — cash", () => {
  it("accepts a valid cash row", () => {
    const result = allocationTargetSchema.safeParse(validCash());
    expect(result.success).toBe(true);
  });

  it("rejects cash row with null amount", () => {
    const result = allocationTargetSchema.safeParse(
      validCash({ cashAmountUsd: null }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects cash row with negative amount", () => {
    const result = allocationTargetSchema.safeParse(
      validCash({ cashAmountUsd: -100 }),
    );
    expect(result.success).toBe(false);
  });

  it("accepts cash row with zero amount", () => {
    const result = allocationTargetSchema.safeParse(
      validCash({ cashAmountUsd: 0 }),
    );
    expect(result.success).toBe(true);
  });

  it("keeps cash label as-is (no uppercase transform)", () => {
    const result = allocationTargetSchema.safeParse(
      validCash({ name: "Schwab Cash" }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Schwab Cash");
    }
  });

  it("rejects empty cash label", () => {
    const result = allocationTargetSchema.safeParse(validCash({ name: "" }));
    expect(result.success).toBe(false);
  });
});

describe("cashTargetWeightSchema", () => {
  it("accepts zero", () => {
    expect(cashTargetWeightSchema.safeParse(0).success).toBe(true);
  });

  it("accepts the upper bound 100", () => {
    expect(cashTargetWeightSchema.safeParse(100).success).toBe(true);
  });

  it("accepts a fractional value in range", () => {
    const result = cashTargetWeightSchema.safeParse(15.5);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe(15.5);
    }
  });

  it("rejects negative values", () => {
    expect(cashTargetWeightSchema.safeParse(-1).success).toBe(false);
  });

  it("rejects values above 100", () => {
    expect(cashTargetWeightSchema.safeParse(101).success).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(cashTargetWeightSchema.safeParse("15").success).toBe(false);
  });
});

describe("allocationTargetSchema — discriminator", () => {
  it("rejects invalid kind", () => {
    const result = allocationTargetSchema.safeParse({
      kind: "bond",
      name: "BND",
      targetWeight: 10,
      cashAmountUsd: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing kind", () => {
    const result = allocationTargetSchema.safeParse({
      name: "AAPL",
      targetWeight: 10,
      cashAmountUsd: null,
    });
    expect(result.success).toBe(false);
  });
});
