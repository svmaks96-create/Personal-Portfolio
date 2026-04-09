import { describe, it, expect } from "vitest";
import { importRowSchema, COLUMN_MAP, REQUIRED_COLUMNS } from "./import";

function validRow(overrides: Record<string, unknown> = {}) {
  return {
    date: "2025-03-15",
    ticker: "AAPL",
    action: "buy",
    quantity: 10,
    grossAmount: 1500,
    fees: 4.95,
    portfolio: "Main",
    currency: "USD",
    ...overrides,
  };
}

describe("importRowSchema", () => {
  it("accepts a valid row", () => {
    const result = importRowSchema.safeParse(validRow());
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = importRowSchema.safeParse(validRow({ date: "15-03-2025" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("date"))).toBe(true);
    }
  });

  it("rejects empty date", () => {
    const result = importRowSchema.safeParse(validRow({ date: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects empty ticker", () => {
    const result = importRowSchema.safeParse(validRow({ ticker: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("ticker"))).toBe(true);
    }
  });

  it("uppercases ticker via transform", () => {
    const result = importRowSchema.safeParse(validRow({ ticker: "aapl" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe("AAPL");
    }
  });

  it("rejects invalid action", () => {
    const result = importRowSchema.safeParse(validRow({ action: "swap" }));
    expect(result.success).toBe(false);
  });

  it("accepts all valid action types", () => {
    for (const action of ["buy", "sell", "dividend", "fee"]) {
      const data = action === "dividend" || action === "fee"
        ? validRow({ action, quantity: 0 })
        : validRow({ action });
      const result = importRowSchema.safeParse(data);
      expect(result.success).toBe(true);
    }
  });

  it("rejects negative quantity", () => {
    const result = importRowSchema.safeParse(validRow({ quantity: -5 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("quantity"))).toBe(true);
    }
  });

  it("rejects zero quantity on buy", () => {
    const result = importRowSchema.safeParse(validRow({ action: "buy", quantity: 0 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("quantity"))).toBe(true);
    }
  });

  it("rejects zero quantity on sell", () => {
    const result = importRowSchema.safeParse(validRow({ action: "sell", quantity: 0 }));
    expect(result.success).toBe(false);
  });

  it("accepts zero quantity on dividend", () => {
    const result = importRowSchema.safeParse(
      validRow({ action: "dividend", quantity: 0, grossAmount: 50 }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts zero quantity on fee", () => {
    const result = importRowSchema.safeParse(
      validRow({ action: "fee", quantity: 0, grossAmount: 10 }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects negative fees", () => {
    const result = importRowSchema.safeParse(validRow({ fees: -1 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("fees"))).toBe(true);
    }
  });

  it("defaults fees to 0 when omitted", () => {
    const { fees: _fees, ...row } = validRow();
    const result = importRowSchema.safeParse(row);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fees).toBe(0);
    }
  });

  it("rejects negative grossAmount on buy (FR29)", () => {
    const result = importRowSchema.safeParse(validRow({ action: "buy", grossAmount: -100 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("grossAmount"))).toBe(true);
    }
  });

  it("rejects negative grossAmount on sell (FR29)", () => {
    const result = importRowSchema.safeParse(validRow({ action: "sell", grossAmount: -100 }));
    expect(result.success).toBe(false);
  });

  it("rejects negative grossAmount on fee (FR29)", () => {
    const result = importRowSchema.safeParse(validRow({ action: "fee", grossAmount: -100, quantity: 0 }));
    expect(result.success).toBe(false);
  });

  it("allows negative grossAmount on dividend (withholding tax, FR29)", () => {
    const result = importRowSchema.safeParse(
      validRow({ action: "dividend", grossAmount: -5.25, quantity: 0 }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects empty portfolio", () => {
    const result = importRowSchema.safeParse(validRow({ portfolio: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects currency with wrong length", () => {
    const result = importRowSchema.safeParse(validRow({ currency: "US" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("currency"))).toBe(true);
    }
  });

  it("uppercases currency via transform", () => {
    const result = importRowSchema.safeParse(validRow({ currency: "gbp" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("GBP");
    }
  });

  it("rejects missing required fields", () => {
    const result = importRowSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("importRowSchema re-validation edge cases", () => {
  it("correcting an invalid date resolves the error", () => {
    // First: invalid
    const bad = importRowSchema.safeParse(validRow({ date: "bad" }));
    expect(bad.success).toBe(false);

    // Then: corrected
    const good = importRowSchema.safeParse(validRow({ date: "2025-03-15" }));
    expect(good.success).toBe(true);
  });

  it("editing a valid row to have empty ticker introduces an error", () => {
    const good = importRowSchema.safeParse(validRow());
    expect(good.success).toBe(true);

    const bad = importRowSchema.safeParse(validRow({ ticker: "" }));
    expect(bad.success).toBe(false);
    if (!bad.success) {
      expect(bad.error.issues.some((i) => i.path.includes("ticker"))).toBe(true);
    }
  });

  it("already-uppercased ticker passes through transforms", () => {
    const result = importRowSchema.safeParse(validRow({ ticker: "AAPL" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe("AAPL");
    }
  });

  it("changing action from buy to dividend allows zero quantity", () => {
    const buyZero = importRowSchema.safeParse(validRow({ action: "buy", quantity: 0 }));
    expect(buyZero.success).toBe(false);

    const divZero = importRowSchema.safeParse(validRow({ action: "dividend", quantity: 0 }));
    expect(divZero.success).toBe(true);
  });

  it("changing quantity from negative to positive resolves error", () => {
    const bad = importRowSchema.safeParse(validRow({ quantity: -5 }));
    expect(bad.success).toBe(false);

    const good = importRowSchema.safeParse(validRow({ quantity: 5 }));
    expect(good.success).toBe(true);
  });
});

describe("COLUMN_MAP", () => {
  it("maps all 8 required columns", () => {
    expect(Object.keys(COLUMN_MAP)).toHaveLength(8);
  });

  it("maps 'gross amount' to 'grossAmount'", () => {
    expect(COLUMN_MAP["gross amount"]).toBe("grossAmount");
  });

  it("uses lowercase keys for case-insensitive matching", () => {
    for (const key of Object.keys(COLUMN_MAP)) {
      expect(key).toBe(key.toLowerCase());
    }
  });
});

describe("REQUIRED_COLUMNS", () => {
  it("includes all column header names", () => {
    expect(REQUIRED_COLUMNS).toContain("date");
    expect(REQUIRED_COLUMNS).toContain("ticker");
    expect(REQUIRED_COLUMNS).toContain("action");
    expect(REQUIRED_COLUMNS).toContain("quantity");
    expect(REQUIRED_COLUMNS).toContain("gross amount");
    expect(REQUIRED_COLUMNS).toContain("fees");
    expect(REQUIRED_COLUMNS).toContain("portfolio");
    expect(REQUIRED_COLUMNS).toContain("currency");
  });
});
