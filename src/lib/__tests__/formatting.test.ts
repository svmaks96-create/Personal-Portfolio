import { describe, it, expect } from "vitest";
import { formatCurrency, formatShares, formatPercent, formatPnL } from "../formatting";

describe("formatCurrency", () => {
  it("formats with default USD currency", () => {
    expect(formatCurrency(1234.5)).toBe("USD 1234.50");
  });

  it("formats with specified currency", () => {
    expect(formatCurrency(100, "GBP")).toBe("GBP 100.00");
  });
});

describe("formatShares", () => {
  it("formats to 4 decimal places", () => {
    expect(formatShares(10)).toBe("10.0000");
    expect(formatShares(0.5)).toBe("0.5000");
  });
});

describe("formatPercent", () => {
  it("formats as percentage", () => {
    expect(formatPercent(12.345)).toBe("12.35%");
  });
});

describe("formatPnL", () => {
  it("formats positive PnL with + sign", () => {
    expect(formatPnL(500)).toBe("+USD 500.00");
  });

  it("formats negative PnL", () => {
    expect(formatPnL(-200, "EUR")).toBe("EUR -200.00");
  });
});
