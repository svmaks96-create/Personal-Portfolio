import { describe, it, expect } from "vitest";
import { pnlColorClass, pnlDirection } from "./pnl";

describe("pnlColorClass", () => {
  it("returns empty string for null", () => {
    expect(pnlColorClass(null)).toBe("");
  });
  it("returns empty string for zero", () => {
    expect(pnlColorClass(0)).toBe("");
  });
  it("returns emerald for positive values", () => {
    expect(pnlColorClass(100)).toBe("text-emerald-600");
    expect(pnlColorClass(0.01)).toBe("text-emerald-600");
  });
  it("returns red for negative values", () => {
    expect(pnlColorClass(-50)).toBe("text-red-600");
    expect(pnlColorClass(-0.01)).toBe("text-red-600");
  });
});

describe("pnlDirection", () => {
  it("returns null for null", () => {
    expect(pnlDirection(null)).toBeNull();
  });
  it("returns null for zero", () => {
    expect(pnlDirection(0)).toBeNull();
  });
  it("returns positive for positive values", () => {
    expect(pnlDirection(100)).toBe("positive");
    expect(pnlDirection(0.01)).toBe("positive");
  });
  it("returns negative for negative values", () => {
    expect(pnlDirection(-50)).toBe("negative");
    expect(pnlDirection(-0.01)).toBe("negative");
  });
});
