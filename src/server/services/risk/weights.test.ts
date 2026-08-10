import { describe, expect, it } from "vitest";
import {
  computeUniverseWeights,
  type UniverseHolding,
} from "@/server/services/risk/weights";

const BOOK: UniverseHolding[] = [
  { ticker: "NVDA", instrument: "stock", isEtf: false, marketValueUsd: 30_000 },
  { ticker: "TSM", instrument: "stock", isEtf: false, marketValueUsd: 20_000 },
  { ticker: "VTI", instrument: "stock", isEtf: true, marketValueUsd: 40_000 },
  { ticker: "VXUS", instrument: "stock", isEtf: true, marketValueUsd: 5_000 },
  { ticker: "MNDY", instrument: "option", isEtf: false, marketValueUsd: 5_000 },
];

describe("computeUniverseWeights", () => {
  it("splits stocks and ETFs into their own universes, options in neither", () => {
    const stocks = computeUniverseWeights(BOOK, "stocks");
    expect(stocks.weights.map((w) => w.ticker)).toEqual(["NVDA", "TSM"]);
    expect(stocks.totalMarketValueUsd).toBe(50_000);

    const etfs = computeUniverseWeights(BOOK, "etfs");
    expect(etfs.weights.map((w) => w.ticker)).toEqual(["VTI", "VXUS"]);

    const all = computeUniverseWeights(BOOK, "all");
    expect(all.weights.map((w) => w.ticker)).toEqual([
      "VTI",
      "NVDA",
      "TSM",
      "VXUS",
    ]);
    expect(all.excludedOptionsValueUsd).toBe(5_000);
  });

  it("weights sum to 100 within a universe and are sorted descending", () => {
    const all = computeUniverseWeights(BOOK, "all");
    const sum = all.weights.reduce((a, w) => a + w.weightPct, 0);
    expect(sum).toBeCloseTo(100, 10);
    for (let i = 1; i < all.weights.length; i++) {
      expect(all.weights[i - 1].weightPct).toBeGreaterThanOrEqual(
        all.weights[i].weightPct
      );
    }
    expect(all.weights[0].weightPct).toBeCloseTo((40_000 / 95_000) * 100, 10);
  });

  it("reports the universe's share of the whole priced book", () => {
    // Book total includes the option: 100k. Stocks universe covers 50k.
    const stocks = computeUniverseWeights(BOOK, "stocks");
    expect(stocks.shareOfBookPct).toBeCloseTo(50, 10);
    const all = computeUniverseWeights(BOOK, "all");
    expect(all.shareOfBookPct).toBeCloseTo(95, 10);
  });

  it("excludes unpriced holdings and lists them", () => {
    const withUnpriced: UniverseHolding[] = [
      ...BOOK,
      { ticker: "GHOST", instrument: "stock", isEtf: false, marketValueUsd: null },
    ];
    const stocks = computeUniverseWeights(withUnpriced, "stocks");
    expect(stocks.weights.map((w) => w.ticker)).toEqual(["NVDA", "TSM"]);
    expect(stocks.unpricedTickers).toEqual(["GHOST"]);
  });

  it("handles an empty universe without dividing by zero", () => {
    const onlyStocks = BOOK.filter((h) => !h.isEtf);
    const etfs = computeUniverseWeights(onlyStocks, "etfs");
    expect(etfs.weights).toEqual([]);
    expect(etfs.totalMarketValueUsd).toBe(0);
    expect(etfs.shareOfBookPct).toBe(0);
  });
});
