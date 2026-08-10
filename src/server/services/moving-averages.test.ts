import { describe, it, expect } from "vitest";
import { computeDmaContext, type PricePoint } from "./moving-averages";

function series(days: number, fn: (i: number) => number): PricePoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    value: fn(i),
  }));
}

describe("computeDmaContext", () => {
  it("computes both SMAs and distances on a flat series", () => {
    const ctx = computeDmaContext(series(250, () => 100));
    expect(ctx.lastPrice).toBe(100);
    expect(ctx.sma50).toBeCloseTo(100, 10);
    expect(ctx.sma200).toBeCloseTo(100, 10);
    expect(ctx.distanceTo50Pct).toBeCloseTo(0, 10);
    expect(ctx.distanceTo200Pct).toBeCloseTo(0, 10);
  });

  it("computes distance on a linear ramp", () => {
    // Prices 1..250; last = 250. SMA50 = mean(201..250) = 225.5.
    const ctx = computeDmaContext(series(250, (i) => i + 1));
    expect(ctx.sma50).toBeCloseTo(225.5, 10);
    expect(ctx.sma200).toBeCloseTo(150.5, 10);
    expect(ctx.distanceTo50Pct).toBeCloseTo(((250 - 225.5) / 225.5) * 100, 8);
    expect(ctx.distanceTo200Pct).toBeCloseTo(((250 - 150.5) / 150.5) * 100, 8);
  });

  it("returns null SMAs when history is too short — never a shorter window", () => {
    const ctx = computeDmaContext(series(60, () => 100));
    expect(ctx.sma50).not.toBeNull();
    expect(ctx.sma200).toBeNull();
    expect(ctx.distanceTo200Pct).toBeNull();

    const tiny = computeDmaContext(series(10, () => 100));
    expect(tiny.sma50).toBeNull();
    expect(tiny.lastPrice).toBe(100);
  });

  it("respects asOfDate and empty input", () => {
    const prices = series(250, (i) => i + 1);
    const cutoff = prices[199].date;
    const ctx = computeDmaContext(prices, cutoff);
    expect(ctx.lastPrice).toBe(200);
    expect(ctx.sma200).toBeCloseTo(100.5, 10);

    expect(computeDmaContext([]).lastPrice).toBeNull();
    expect(computeDmaContext(prices, "2024-01-01").lastPrice).toBeNull();
  });
});
