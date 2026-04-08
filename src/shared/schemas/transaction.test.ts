import { describe, it, expect } from "vitest";
import { transactionSchema } from "./transaction";

function validTransaction(overrides: Record<string, unknown> = {}) {
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

describe("transactionSchema", () => {
  it("accepts a valid transaction", () => {
    const result = transactionSchema.safeParse(validTransaction());
    expect(result.success).toBe(true);
  });

  it("rejects invalid date format", () => {
    const result = transactionSchema.safeParse(validTransaction({ date: "15-03-2025" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("date"))).toBe(true);
    }
  });

  it("rejects empty date", () => {
    const result = transactionSchema.safeParse(validTransaction({ date: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects empty ticker", () => {
    const result = transactionSchema.safeParse(validTransaction({ ticker: "" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("ticker"))).toBe(true);
    }
  });

  it("uppercases ticker via transform", () => {
    const result = transactionSchema.safeParse(validTransaction({ ticker: "aapl" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe("AAPL");
    }
  });

  it("rejects invalid action", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "swap" }));
    expect(result.success).toBe(false);
  });

  it("rejects negative quantity", () => {
    const result = transactionSchema.safeParse(validTransaction({ quantity: -5 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("quantity"))).toBe(true);
    }
  });

  it("rejects zero quantity on buy", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "buy", quantity: 0 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("quantity"))).toBe(true);
    }
  });

  it("rejects zero quantity on sell", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "sell", quantity: 0 }));
    expect(result.success).toBe(false);
  });

  it("accepts zero quantity on dividend", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "dividend", quantity: 0, grossAmount: 50 }));
    expect(result.success).toBe(true);
  });

  it("accepts zero quantity on fee", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "fee", quantity: 0, grossAmount: 10 }));
    expect(result.success).toBe(true);
  });

  it("rejects negative fees", () => {
    const result = transactionSchema.safeParse(validTransaction({ fees: -1 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("fees"))).toBe(true);
    }
  });

  it("rejects negative grossAmount on buy", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "buy", grossAmount: -100 }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("grossAmount"))).toBe(true);
    }
  });

  it("rejects negative grossAmount on sell", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "sell", grossAmount: -100 }));
    expect(result.success).toBe(false);
  });

  it("rejects negative grossAmount on fee", () => {
    const result = transactionSchema.safeParse(validTransaction({ action: "fee", grossAmount: -100 }));
    expect(result.success).toBe(false);
  });

  it("allows negative grossAmount on dividend (withholding tax)", () => {
    const result = transactionSchema.safeParse(
      validTransaction({ action: "dividend", grossAmount: -5.25, quantity: 0 })
    );
    expect(result.success).toBe(true);
  });

  it("rejects empty portfolio", () => {
    const result = transactionSchema.safeParse(validTransaction({ portfolio: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects currency with wrong length", () => {
    const result = transactionSchema.safeParse(validTransaction({ currency: "US" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes("currency"))).toBe(true);
    }
  });

  it("uppercases currency via transform", () => {
    const result = transactionSchema.safeParse(validTransaction({ currency: "gbp" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.currency).toBe("GBP");
    }
  });

  it("rejects missing required fields", () => {
    const result = transactionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
