import { describe, it, expect } from "vitest";
import { computePortfolioTWRR, computeBenchmarkSeries } from "./twrr";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

function tx(
  id: number,
  date: string,
  ticker: string,
  action: TransactionInput["action"],
  quantity: number,
  grossAmount: number,
  opts: Partial<TransactionInput> = {}
): TransactionInput {
  return {
    id,
    date,
    ticker,
    action,
    quantity,
    grossAmount,
    fees: 0,
    portfolio: "Default",
    currency: "USD",
    ...opts,
  };
}

function priceSeries(
  symbol: string,
  entries: [string, number][]
): MarketDataInput[] {
  return entries.map(([date, value]) => ({ symbol, date, value }));
}

const EPS = 1e-9;

describe("computePortfolioTWRR", () => {
  it("(a) single buy + price drift: cumulative 0.99", () => {
    const calendar = ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"];
    const txns = [tx(1, "2026-01-02", "AAPL", "buy", 10, 1000)];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 110],
        ["2026-01-04", 99],
      ]),
    };

    const result = computePortfolioTWRR(
      txns,
      prices,
      [],
      calendar,
      "2026-01-01",
      "2026-01-04"
    );

    expect(result.series.length).toBe(4);
    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[1].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[2].growthOfDollar).toBeCloseTo(1.1, 9);
    expect(result.series[3].growthOfDollar).toBeCloseTo(0.99, 9);
    expect(result.cumulativeReturnPct).toBeCloseTo(-1, 6);
  });

  it("(b) mid-period deposit nets to r=0: cumulative 1.21", () => {
    // Day 0 = first-buy day. No prior-day row exists, so MV_prev = 0 and d0 is the anchor.
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 10, 1000),
      tx(2, "2026-01-04", "AAPL", "buy", 5, 550),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 110],
        ["2026-01-04", 110],
        ["2026-01-05", 121],
      ]),
    };

    const result = computePortfolioTWRR(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-05"
    );

    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[1].growthOfDollar).toBeCloseTo(1.1, 9);
    // Same-day deposit: r = (1650 - 550) / 1100 = 1.0 → growth unchanged
    expect(result.series[2].growthOfDollar).toBeCloseTo(1.1, 9);
    expect(result.series[3].growthOfDollar).toBeCloseTo(1.21, 9);
    expect(result.cumulativeReturnPct).toBeCloseTo(21, 6);
  });

  it("(c) closed-then-reopened: skip rule preserves the gain across the gap", () => {
    const calendar = [
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
      "2026-01-07",
    ];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 10, 1000),
      tx(2, "2026-01-04", "AAPL", "sell", 10, 1100),
      tx(3, "2026-01-06", "AAPL", "buy", 5, 600),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 110],
        ["2026-01-04", 110],
        ["2026-01-05", 115],
        ["2026-01-06", 120],
        ["2026-01-07", 132],
      ]),
    };

    const result = computePortfolioTWRR(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-07"
    );

    // Jan 2: anchor (MV_prev=0 skip)
    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    // Jan 3: $100 → $110 → r=1.10
    expect(result.series[1].growthOfDollar).toBeCloseTo(1.1, 9);
    // Jan 4 sell at $110: r = (0 - (-1100))/1100 = 1.0
    expect(result.series[2].growthOfDollar).toBeCloseTo(1.1, 9);
    // Jan 5: MV_prev = 0 → skip
    expect(result.series[3].growthOfDollar).toBeCloseTo(1.1, 9);
    // Jan 6 buy 5 @ $120: MV_prev still 0 → skip
    expect(result.series[4].growthOfDollar).toBeCloseTo(1.1, 9);
    // Jan 7: $120 → $132 → r=1.10, growth=1.21
    expect(result.series[5].growthOfDollar).toBeCloseTo(1.21, 9);
    expect(result.cumulativeReturnPct).toBeCloseTo(21, 6);
  });

  it("(d) non-USD: GBPUSD multiplies through day by day", () => {
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04"];
    const txns = [
      tx(1, "2026-01-02", "VOD.L", "buy", 100, 50, { currency: "GBP" }),
    ];
    // 100 shares, GBP price stable at 50 → 100 * 50 = 5000 GBP
    const prices = {
      "VOD.L": priceSeries("VOD.L", [
        ["2026-01-02", 50],
        ["2026-01-03", 50],
        ["2026-01-04", 50],
      ]),
    };
    // FX: Jan2=1.25, Jan3=1.25, Jan4=1.50 → GBP->USD
    const fx: FxRateInput[] = [
      { symbol: "GBPUSD", date: "2026-01-02", value: 1.25 },
      { symbol: "GBPUSD", date: "2026-01-03", value: 1.25 },
      { symbol: "GBPUSD", date: "2026-01-04", value: 1.5 },
    ];

    const result = computePortfolioTWRR(
      txns,
      prices,
      fx,
      calendar,
      "2026-01-02",
      "2026-01-04"
    );

    // Jan 2: MV = 5000 * 1.25 = 6250 (anchor)
    expect(result.series[0].marketValueUsd).toBeCloseTo(6250, 6);
    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    // Jan 3: MV = 6250, no flow → r = 6250/6250 = 1.0
    expect(result.series[1].growthOfDollar).toBeCloseTo(1, 9);
    // Jan 4: MV = 5000 * 1.50 = 7500, no flow → r = 7500/6250 = 1.20
    expect(result.series[2].marketValueUsd).toBeCloseTo(7500, 6);
    expect(result.series[2].growthOfDollar).toBeCloseTo(1.2, 9);
  });

  it("(e) returns empty series gracefully when no transactions", () => {
    const result = computePortfolioTWRR(
      [],
      {},
      [],
      ["2026-01-02", "2026-01-03"],
      "2026-01-02",
      "2026-01-03"
    );
    expect(result.series).toEqual([]);
    expect(result.cumulativeReturnPct).toBeNull();
    expect(result.annualizedReturnPct).toBeNull();
  });

  it("ignores dividends in CF (total-return convention)", () => {
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04"];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 10, 1000),
      tx(2, "2026-01-03", "AAPL", "dividend", 0, 50),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 100],
        ["2026-01-04", 100],
      ]),
    };

    const result = computePortfolioTWRR(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-04"
    );

    // Price is flat so growth should stay at 1.0 despite the dividend event.
    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[1].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[2].growthOfDollar).toBeCloseTo(1, 9);
  });
});

describe("computeBenchmarkSeries", () => {
  it("normalizes price series to growth-of-$1", () => {
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04"];
    const prices = priceSeries("SPY", [
      ["2026-01-02", 500],
      ["2026-01-03", 510],
      ["2026-01-04", 525],
    ]);

    const result = computeBenchmarkSeries(
      "SPY",
      prices,
      calendar,
      "2026-01-02",
      "2026-01-04"
    );

    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[1].growthOfDollar).toBeCloseTo(510 / 500, 9);
    expect(result.series[2].growthOfDollar).toBeCloseTo(525 / 500, 9);
    expect(result.cumulativeReturnPct).toBeCloseTo((525 / 500 - 1) * 100, 6);
  });

  it("returns empty when no price history", () => {
    const result = computeBenchmarkSeries(
      "SPY",
      [],
      ["2026-01-02"],
      "2026-01-02",
      "2026-01-02"
    );
    expect(result.series).toEqual([]);
  });

  it("forward-fills missing dates", () => {
    // Calendar has a weekend day between prices; forward-fill should use Friday.
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-05"];
    const prices = priceSeries("SPY", [
      ["2026-01-02", 500],
      // No data for 2026-01-03
      ["2026-01-05", 510],
    ]);

    const result = computeBenchmarkSeries(
      "SPY",
      prices,
      calendar,
      "2026-01-02",
      "2026-01-05"
    );

    expect(result.series.length).toBe(3);
    // Day 2 forward-fills to 500
    expect(result.series[1].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[2].growthOfDollar).toBeCloseTo(510 / 500, 9);
  });
});

// Guard against accidental re-export drift: keep epsilon in scope.
void EPS;
