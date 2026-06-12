import { describe, it, expect } from "vitest";
import {
  computePortfolioTWRR,
  computeBenchmarkSeries,
  computeValueVsCostBasisSeries,
  sliceAndReanchor,
} from "./twrr";
import { computePositions } from "./computation";
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
    instrument: "stock",
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

  it("(IPO gap) values pre-listing subscription at cost until quotes begin", () => {
    // Existing AAPL position; IPO subscribed on d2 but first traded on d5.
    // Without any gap handling, the subscription day's CF lands while IPO
    // MV is 0 → spurious negative return. Seeding a synthetic cost-basis
    // price at the subscription date makes IPO contribute its subscription
    // price across the gap, netting the CF to r ≈ 1.0 and letting any
    // listing-day premium show up on the actual listing day.
    const calendar = [
      "2026-01-02",
      "2026-01-05",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-12",
      "2026-01-13",
    ];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 100, 5000),
      // Subscription day; no IPO price yet.
      tx(2, "2026-01-07", "IPO", "buy", 200, 1000),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 50],
        ["2026-01-05", 50],
        ["2026-01-07", 50],
        ["2026-01-08", 50],
        ["2026-01-09", 50],
        ["2026-01-12", 50],
        ["2026-01-13", 50],
      ]),
      // IPO trades starting d5 (2026-01-12).
      IPO: priceSeries("IPO", [
        ["2026-01-12", 5],
        ["2026-01-13", 5.5],
      ]),
    };

    const result = computePortfolioTWRR(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-13"
    );

    expect(result.series[0].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[1].growthOfDollar).toBeCloseTo(1, 9);
    // Subscription day: synthetic cost-basis price ($1000/200=$5) makes
    // IPO contribute $1000, netting the +$1000 CF. r = (6000 - 1000) / 5000 = 1.0.
    expect(result.series[2].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[3].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[4].growthOfDollar).toBeCloseTo(1, 9);
    // First real IPO price (d5) equals cost basis here, so r=1.
    expect(result.series[5].growthOfDollar).toBeCloseTo(1, 9);
    // d6: AAPL flat, IPO $5 → $5.50. MV: 5000 + 200*5.50 = 6100. r=6100/6000.
    expect(result.series[6].growthOfDollar).toBeCloseTo(6100 / 6000, 9);
  });

  it("(IPO gap) listing premium lands on listing day, not subscription day", () => {
    // Regression for the PARKIN-style IPO: subscription price ≠ listing
    // price. Subscription @ $5, listing @ $7 on d5. The +40% pop must show
    // up as a return on d5 (listing day), not be collapsed into d2.
    const calendar = [
      "2026-01-02",
      "2026-01-05",
      "2026-01-07",
      "2026-01-08",
      "2026-01-09",
      "2026-01-12",
    ];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 100, 5000),
      tx(2, "2026-01-07", "IPO", "buy", 200, 1000), // $5/share subscription
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 50],
        ["2026-01-05", 50],
        ["2026-01-07", 50],
        ["2026-01-08", 50],
        ["2026-01-09", 50],
        ["2026-01-12", 50],
      ]),
      IPO: priceSeries("IPO", [["2026-01-12", 7]]), // lists at $7 (+40%)
    };

    const result = computePortfolioTWRR(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-12"
    );

    // Subscription day: IPO valued at cost ($5) → MV=6000, CF=1000, r=1.
    expect(result.series[2].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[3].growthOfDollar).toBeCloseTo(1, 9);
    expect(result.series[4].growthOfDollar).toBeCloseTo(1, 9);
    // Listing day: IPO revalues $5 → $7, MV goes 6000 → 6400, r=6400/6000.
    expect(result.series[5].growthOfDollar).toBeCloseTo(6400 / 6000, 9);
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

describe("sliceAndReanchor", () => {
  // Synthetic ITD series: growth-of-$1 doubling over 4 trading days.
  const itd = computeBenchmarkSeries(
    "SPY",
    [
      { symbol: "SPY", date: "2026-01-02", value: 100 },
      { symbol: "SPY", date: "2026-01-03", value: 110 },
      { symbol: "SPY", date: "2026-01-04", value: 121 },
      { symbol: "SPY", date: "2026-01-05", value: 200 },
    ],
    ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"],
    "2026-01-02",
    "2026-01-05",
  );

  it("is an identity when periodStart equals inception (ITD)", () => {
    const out = sliceAndReanchor(itd, "2026-01-02");
    expect(out.series.length).toBe(itd.series.length);
    out.series.forEach((p, i) => {
      expect(p.growthOfDollar).toBeCloseTo(itd.series[i].growthOfDollar, 9);
    });
    expect(out.cumulativeReturnPct).toBeCloseTo(itd.cumulativeReturnPct!, 6);
  });

  it("re-anchors to the last point before periodStart", () => {
    // Anchor day = 2026-01-03 (growth 1.10). Window keeps 01-04 and 01-05.
    const out = sliceAndReanchor(itd, "2026-01-04");
    expect(out.series.map((p) => p.date)).toEqual(["2026-01-04", "2026-01-05"]);
    // 1.21 / 1.10 = 1.10 on day 1; 2.00 / 1.10 ≈ 1.818 on day 2.
    expect(out.series[0].growthOfDollar).toBeCloseTo(1.1, 9);
    expect(out.series[1].growthOfDollar).toBeCloseTo(200 / 110, 9);
    expect(out.cumulativeReturnPct).toBeCloseTo((200 / 110 - 1) * 100, 6);
  });

  it("falls back to series[0] when periodStart predates all data", () => {
    // 2025-01-01 is before anything in the series → anchor = series[0] whose
    // growth is 1, so the result is ITD.
    const out = sliceAndReanchor(itd, "2025-01-01");
    expect(out.series.length).toBe(itd.series.length);
    expect(out.cumulativeReturnPct).toBeCloseTo(itd.cumulativeReturnPct!, 6);
  });

  it("returns empty when no points are in-window", () => {
    const out = sliceAndReanchor(itd, "2030-01-01");
    expect(out.series).toEqual([]);
    expect(out.cumulativeReturnPct).toBeNull();
  });

  it("returns empty for an empty input series", () => {
    const out = sliceAndReanchor(
      {
        series: [],
        cumulativeReturnPct: null,
        annualizedReturnPct: null,
        startDate: null,
        endDate: null,
      },
      "2026-01-02",
    );
    expect(out.series).toEqual([]);
  });
});

describe("computeValueVsCostBasisSeries", () => {
  it("single buy then hold: basis flat, value tracks price", () => {
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04"];
    const txns = [tx(1, "2026-01-02", "AAPL", "buy", 10, 1000, { fees: 5 })];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 110],
        ["2026-01-04", 120],
      ]),
    };

    const result = computeValueVsCostBasisSeries(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-04",
    );

    expect(result).toHaveLength(3);
    // Cost basis = 1000 + 5 = 1005 on every day
    expect(result[0].costBasis).toBeCloseTo(1005, 9);
    expect(result[1].costBasis).toBeCloseTo(1005, 9);
    expect(result[2].costBasis).toBeCloseTo(1005, 9);
    // Market value tracks price
    expect(result[0].portfolioValue).toBeCloseTo(1000, 9);
    expect(result[1].portfolioValue).toBeCloseTo(1100, 9);
    expect(result[2].portfolioValue).toBeCloseTo(1200, 9);
  });

  it("buy then partial sell: basis drops proportionally", () => {
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04"];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 10, 1000),
      tx(2, "2026-01-03", "AAPL", "sell", 5, 600),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 120],
        ["2026-01-04", 120],
      ]),
    };

    const result = computeValueVsCostBasisSeries(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-04",
    );

    // Day 1: buy 10 @ 100 → shares=10, basis=1000
    expect(result[0].costBasis).toBeCloseTo(1000, 9);
    // Day 2: sell 5, reduction = (5/10) * 1000 = 500 → basis=500
    expect(result[1].costBasis).toBeCloseTo(500, 9);
    expect(result[1].portfolioValue).toBeCloseTo(5 * 120, 9);
    // Day 3: no tx, basis unchanged
    expect(result[2].costBasis).toBeCloseTo(500, 9);
  });

  it("terminal cost basis matches computePositions on same inputs", () => {
    const calendar = ["2026-01-02", "2026-01-03", "2026-01-04", "2026-01-05"];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 10, 1000, { fees: 2 }),
      tx(2, "2026-01-03", "AAPL", "buy", 5, 600, { fees: 1 }),
      tx(3, "2026-01-04", "AAPL", "sell", 3, 400),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 120],
        ["2026-01-04", 130],
        ["2026-01-05", 130],
      ]),
    };

    const series = computeValueVsCostBasisSeries(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-05",
    );

    // Latest price map shape used by computePositions
    const priceMap = {
      AAPL: { symbol: "AAPL", date: "2026-01-05", value: 130 },
    };
    const positions = computePositions(txns, priceMap, [], "2026-01-05");
    const terminalBasis = positions.reduce(
      (acc, p) => acc + (p.costBasis ?? 0),
      0,
    );

    expect(series.at(-1)!.costBasis).toBeCloseTo(terminalBasis, 6);
  });

  it("dividend does not change cost basis", () => {
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

    const result = computeValueVsCostBasisSeries(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-04",
    );

    expect(result[0].costBasis).toBeCloseTo(1000, 9);
    expect(result[1].costBasis).toBeCloseTo(1000, 9);
    expect(result[2].costBasis).toBeCloseTo(1000, 9);
  });

  it("fee transaction bumps cost basis", () => {
    const calendar = ["2026-01-02", "2026-01-03"];
    const txns = [
      tx(1, "2026-01-02", "AAPL", "buy", 10, 1000),
      tx(2, "2026-01-03", "AAPL", "fee", 0, 0, { fees: 15 }),
    ];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 100],
      ]),
    };

    const result = computeValueVsCostBasisSeries(
      txns,
      prices,
      [],
      calendar,
      "2026-01-02",
      "2026-01-03",
    );

    expect(result[0].costBasis).toBeCloseTo(1000, 9);
    expect(result[1].costBasis).toBeCloseTo(1015, 9);
  });

  it("non-USD basis is FX-converted to USD", () => {
    const calendar = ["2026-01-02", "2026-01-03"];
    const txns = [
      tx(1, "2026-01-02", "VOD.L", "buy", 100, 50, { currency: "GBP" }),
    ];
    const prices = {
      "VOD.L": priceSeries("VOD.L", [
        ["2026-01-02", 0.5],
        ["2026-01-03", 0.6],
      ]),
    };
    const fx: FxRateInput[] = [
      { symbol: "GBPUSD", date: "2026-01-02", value: 1.25 },
      { symbol: "GBPUSD", date: "2026-01-03", value: 1.25 },
    ];

    const result = computeValueVsCostBasisSeries(
      txns,
      prices,
      fx,
      calendar,
      "2026-01-02",
      "2026-01-03",
    );

    // Basis: 50 GBP * 1.25 = 62.5 USD
    expect(result[0].costBasis).toBeCloseTo(62.5, 9);
    // Value: 100 * 0.5 * 1.25 = 62.5 USD day 1, 100 * 0.6 * 1.25 = 75 USD day 2
    expect(result[0].portfolioValue).toBeCloseTo(62.5, 9);
    expect(result[1].portfolioValue).toBeCloseTo(75, 9);
  });

  it("period window excludes pre-window points but preserves state", () => {
    // Buy well before window; window should still show the correct basis and value
    const calendar = [
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
      "2026-01-06",
    ];
    const txns = [tx(1, "2026-01-02", "AAPL", "buy", 10, 1000)];
    const prices = {
      AAPL: priceSeries("AAPL", [
        ["2026-01-02", 100],
        ["2026-01-03", 110],
        ["2026-01-04", 120],
        ["2026-01-05", 130],
        ["2026-01-06", 140],
      ]),
    };

    const result = computeValueVsCostBasisSeries(
      txns,
      prices,
      [],
      calendar,
      "2026-01-05",
      "2026-01-06",
    );

    expect(result.map((p) => p.date)).toEqual(["2026-01-05", "2026-01-06"]);
    // Basis established before window (day 1) but still present in all emitted rows
    expect(result[0].costBasis).toBeCloseTo(1000, 9);
    expect(result[0].portfolioValue).toBeCloseTo(1300, 9);
    expect(result[1].portfolioValue).toBeCloseTo(1400, 9);
  });

  it("returns empty on no transactions", () => {
    const result = computeValueVsCostBasisSeries(
      [],
      {},
      [],
      ["2026-01-02"],
      "2026-01-02",
      "2026-01-02",
    );
    expect(result).toEqual([]);
  });
});

// Guard against accidental re-export drift: keep epsilon in scope.
void EPS;

describe("option handling", () => {
  const calendar = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"];
  const flatPrices = {
    AAA: priceSeries("AAA", [
      ["2026-01-02", 100],
      ["2026-01-05", 100],
      ["2026-01-06", 100],
      ["2026-01-07", 100],
    ]),
  };

  it("is return-neutral on option open and books realized P&L on close", () => {
    const txns = [
      tx(1, "2026-01-02", "AAA", "buy", 1, 100),
      tx(2, "2026-01-05", "AAA", "buy", 1, 500, { instrument: "option" }),
      tx(3, "2026-01-07", "AAA", "sell", 1, 700, { instrument: "option" }),
    ];

    const result = computePortfolioTWRR(
      txns, flatPrices, [], calendar, "2026-01-02", "2026-01-07"
    );

    const g = result.series.map((p) => p.growthOfDollar);
    // Open day: MV 100+500, CF 500 → flat. Carry day: at cost → flat.
    expect(g[1]).toBeCloseTo(1, EPS_DIGITS);
    expect(g[2]).toBeCloseTo(1, EPS_DIGITS);
    // Close day: MV 100, CF -700, prev 600 → (100 + 700) / 600
    expect(g[3]).toBeCloseTo(800 / 600, EPS_DIGITS);
  });

  it("values open options at fresh marks between trades", () => {
    const txns = [
      tx(1, "2026-01-02", "AAA", "buy", 1, 100),
      tx(2, "2026-01-05", "AAA", "buy", 1, 500, { instrument: "option" }),
    ];
    const marks = {
      AAA: priceSeries("AAA", [["2026-01-06", 550]]),
    };

    const result = computePortfolioTWRR(
      txns, flatPrices, [], calendar, "2026-01-02", "2026-01-07", marks
    );

    // 2026-01-06: MV = 100 stock + 550 mark
    expect(result.series[2].marketValueUsd).toBeCloseTo(650, EPS_DIGITS);
    expect(result.series[2].growthOfDollar).toBeCloseTo(650 / 600, EPS_DIGITS);
  });

  it("seeds synthetic prices from the first STOCK buy, ignoring earlier option buys", () => {
    // Option buy predates the stock buy; without the instrument guard the
    // synthetic seed would price CCC at 500/unit instead of the stock's 100.
    const txns = [
      tx(1, "2026-01-02", "CCC", "buy", 1, 500, { instrument: "option" }),
      tx(2, "2026-01-05", "CCC", "buy", 1, 100),
    ];

    const result = computePortfolioTWRR(
      txns, {}, [], calendar, "2026-01-02", "2026-01-07"
    );

    // 2026-01-05: option basis 500 + 1 share at synthetic cost 100
    expect(result.series[1].marketValueUsd).toBeCloseTo(600, EPS_DIGITS);
  });

  it("includes option basis in both lines of the value-vs-cost-basis series", () => {
    const txns = [
      tx(1, "2026-01-02", "AAA", "buy", 1, 100),
      tx(2, "2026-01-05", "AAA", "buy", 1, 500, { instrument: "option" }),
    ];

    const series = computeValueVsCostBasisSeries(
      txns, flatPrices, [], calendar, "2026-01-02", "2026-01-07"
    );

    const last = series[series.length - 1];
    expect(last.costBasis).toBeCloseTo(600, EPS_DIGITS);
    expect(last.portfolioValue).toBeCloseTo(600, EPS_DIGITS);
  });
});

const EPS_DIGITS = 9;
