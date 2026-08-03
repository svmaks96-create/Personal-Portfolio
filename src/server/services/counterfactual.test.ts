import {
  computeFrozenBook,
  computeDepositsOnlyBenchmark,
  computeNetInvestedSeries,
  computeSyntheticPortfolio,
} from "./counterfactual";
import { computeDailyHoldings } from "./daily-holdings";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

let nextId = 1;
function tx(
  overrides: Partial<TransactionInput> & Pick<TransactionInput, "action">
): TransactionInput {
  return {
    id: nextId++,
    date: "2025-01-02",
    ticker: "VTI",
    instrument: "stock",
    quantity: 0,
    grossAmount: 0,
    fees: 0,
    portfolio: "Test",
    currency: "USD",
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

const NO_FX: FxRateInput[] = [];
const CAL = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"];

function series(ticker: string, rows: [string, number][]): MarketDataInput[] {
  return rows.map(([date, value]) => ({ symbol: ticker, date, value }));
}

function holdings(txs: TransactionInput[], priceHistory: Record<string, MarketDataInput[]>) {
  return computeDailyHoldings({
    transactions: txs,
    priceHistory,
    fxHistory: NO_FX,
    tradingCalendar: CAL,
    endDate: "2025-01-07",
  });
}

describe("computeFrozenBook", () => {
  it("carries a single holding forward at the price ratio", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 110], ["2025-01-07", 130]]),
    };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2025-01-03",
      asOf: "2025-01-07",
      tradingCalendar: CAL,
      priceHistory,
      transactions: txs,
    });

    expect(frozen.startValueUsd).toBeCloseTo(1100, 6);
    expect(frozen.endValueUsd).toBeCloseTo(1300, 6);
    expect(frozen.cumulativeReturnPct).toBeCloseTo((130 / 110 - 1) * 100, 6);
    expect(frozen.series[frozen.series.length - 1].growthOfDollar).toBeCloseTo(130 / 110, 9);
  });

  it("ignores trades made after the freeze date", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      // A big post-freeze purchase that the frozen book must not see.
      tx({ action: "buy", date: "2025-01-06", quantity: 100, grossAmount: 12000 }),
    ];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 110], ["2025-01-07", 130]]),
    };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2025-01-03",
      asOf: "2025-01-07",
      tradingCalendar: CAL,
      priceHistory,
      transactions: txs,
    });

    expect(frozen.positions).toHaveLength(1);
    expect(frozen.positions[0].shares).toBeCloseTo(10, 9);
    expect(frozen.endValueUsd).toBeCloseTo(1300, 6);
  });

  it("excludes options and reports the basis dropped", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({
        action: "buy",
        date: "2025-01-02",
        ticker: "ARM",
        instrument: "option",
        quantity: 2,
        grossAmount: 2000,
      }),
    ];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-07", 130]]),
      ARM: series("ARM", [["2025-01-02", 150], ["2025-01-07", 200]]),
    };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2025-01-02",
      asOf: "2025-01-07",
      tradingCalendar: CAL,
      priceHistory,
      transactions: txs,
    });

    expect(frozen.positions.map((p) => p.ticker)).toEqual(["VTI"]);
    expect(frozen.excludedOptionBasisUsd).toBeCloseTo(2000, 6);
  });

  it("flat-lines a dead price series and reports its share of terminal value", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({
        action: "buy",
        date: "2025-01-02",
        ticker: "DFM:PARKIN",
        quantity: 100,
        grossAmount: 1000,
      }),
    ];
    const priceHistory = {
      // VTI keeps quoting to the end, so it sets the market reference date.
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-07", 100]]),
      // Quotes stop after day one.
      "DFM:PARKIN": series("DFM:PARKIN", [["2025-01-02", 10]]),
    };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2025-01-02",
      asOf: "2025-01-07",
      tradingCalendar: CAL,
      priceHistory,
      transactions: txs,
    });

    const dead = frozen.positions.find((p) => p.ticker === "DFM:PARKIN")!;
    expect(dead.isDeadSeries).toBe(true);
    expect(dead.endPriceDate).toBe("2025-01-02");
    expect(dead.endValueUsd).toBeCloseTo(1000, 6);
    expect(frozen.deadSeriesShareOfEndPct).toBeCloseTo(50, 6);
    // A name still quoting at the market's last date is not stale.
    expect(frozen.positions.find((p) => p.ticker === "VTI")!.isDeadSeries).toBe(false);
  });

  it("does not flag every series as dead when asOf runs past the last quote", () => {
    // The valuation date is pushed past the last quote to pick up a fresher
    // option mark. Staleness must be judged against the market, not against
    // that date, or the whole book reads as dead.
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-07", 120]]),
    };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2025-01-02",
      asOf: "2025-01-09", // beyond every quote
      tradingCalendar: [...CAL, "2025-01-09"],
      priceHistory,
      transactions: txs,
    });

    expect(frozen.positions[0].isDeadSeries).toBe(false);
    expect(frozen.deadSeriesShareOfEndPct).toBe(0);
    expect(frozen.endValueUsd).toBeCloseTo(1200, 6);
  });

  it("weights the trailing dividend yield by frozen position value", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-01-02", ticker: "BND", quantity: 10, grossAmount: 1000 }),
    ];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100]]),
      BND: series("BND", [["2025-01-02", 100]]),
    };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2025-01-02",
      asOf: "2025-01-07",
      tradingCalendar: CAL,
      priceHistory,
      transactions: txs,
      trailingYieldPctByTicker: { VTI: 1.2, BND: 3.8 },
    });

    expect(frozen.estimatedDividendYieldPct).toBeCloseTo(2.5, 6);
  });

  it("returns an empty result when the freeze date predates all data", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const priceHistory = { VTI: series("VTI", [["2025-01-02", 100]]) };

    const frozen = computeFrozenBook(holdings(txs, priceHistory), {
      freezeDate: "2020-01-01",
      asOf: "2025-01-07",
      tradingCalendar: CAL,
      priceHistory,
      transactions: txs,
    });

    expect(frozen.positions).toEqual([]);
    expect(frozen.cumulativeReturnPct).toBeNull();
  });
});

describe("computeNetInvestedSeries", () => {
  it("tracks cumulative flow and a monotone high-water mark", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-03", quantity: 10, grossAmount: 1100 }),
      tx({ action: "buy", date: "2025-01-06", quantity: 5, grossAmount: 600 }),
    ];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 110], ["2025-01-06", 120]]),
    };

    const net = computeNetInvestedSeries(holdings(txs, priceHistory));

    expect(net[0].cumulativeUsd).toBeCloseTo(1000, 6);
    expect(net[1].cumulativeUsd).toBeCloseTo(-100, 6);
    expect(net[2].cumulativeUsd).toBeCloseTo(500, 6);
    // The high-water mark never retreats when capital comes back out.
    expect(net.map((n) => n.highWaterUsd)).toEqual([1000, 1000, 1000, 1000]);
  });
});

describe("computeDepositsOnlyBenchmark", () => {
  it("matches the index price ratio for a single deposit", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const priceHistory = { VTI: series("VTI", [["2025-01-02", 100], ["2025-01-07", 130]]) };
    const spy = series("SPY", [["2025-01-02", 500], ["2025-01-07", 550]]);

    const result = computeDepositsOnlyBenchmark(holdings(txs, priceHistory), {
      symbol: "SPY",
      priceSeries: spy,
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });

    expect(result.totalDepositedUsd).toBeCloseTo(1000, 6);
    expect(result.endValueUsd).toBeCloseTo(1100, 6); // 1000 * 550/500
    expect(result.deposits).toHaveLength(1);
    expect(result.xirrPct).not.toBeNull();
  });

  it("never sells: a liquidation produces no deposit and no withdrawal", () => {
    // The Aug->Nov 2025 pattern. A raw flow schedule would take the benchmark
    // to cash alongside the investor, which measures timing rather than
    // "just buy the index".
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-03", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-01-06", quantity: 10, grossAmount: 1000 }),
    ];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 100], ["2025-01-06", 100]]),
    };
    const spy = series("SPY", [
      ["2025-01-02", 100],
      ["2025-01-03", 110],
      ["2025-01-06", 120],
      ["2025-01-07", 130],
    ]);

    const result = computeDepositsOnlyBenchmark(holdings(txs, priceHistory), {
      symbol: "SPY",
      priceSeries: spy,
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });

    // Only the original $1,000 counts; the round trip through cash nets out.
    expect(result.deposits).toHaveLength(1);
    expect(result.totalDepositedUsd).toBeCloseTo(1000, 6);
    expect(result.endValueUsd).toBeCloseTo(1300, 6);
  });

  it("labels a single-symbol run as measured, not modelled", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const priceHistory = { VTI: series("VTI", [["2025-01-02", 100]]) };
    const result = computeDepositsOnlyBenchmark(holdings(txs, priceHistory), {
      symbol: "SPY",
      priceSeries: series("SPY", [["2025-01-02", 100], ["2025-01-07", 120]]),
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });
    expect(result.isModeled).toBe(false);
    expect(result.modelNote).toBeNull();
    expect(result.schedule).toBe("deposits-only");
    expect(result.label).toBe("All-in SPY");
  });

  it("adds a second deposit when committed capital reaches a new high", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-01-06", quantity: 10, grossAmount: 1000 }),
    ];
    const priceHistory = { VTI: series("VTI", [["2025-01-02", 100]]) };
    const spy = series("SPY", [
      ["2025-01-02", 100],
      ["2025-01-06", 200],
      ["2025-01-07", 400],
    ]);

    const result = computeDepositsOnlyBenchmark(holdings(txs, priceHistory), {
      symbol: "SPY",
      priceSeries: spy,
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });

    expect(result.deposits).toHaveLength(2);
    expect(result.totalDepositedUsd).toBeCloseTo(2000, 6);
    // 10 units from the first deposit + 5 from the second, at 400 = 6,000.
    expect(result.endValueUsd).toBeCloseTo(6000, 6);
    // TWRR is contribution-insensitive: the index quadrupled, so growth is 4x.
    expect(result.cumulativeReturnPct).toBeCloseTo(300, 6);
  });
});

describe("computeSyntheticPortfolio — flow schedules", () => {
  const txs = () => [
    tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
    tx({ action: "sell", date: "2025-01-03", quantity: 10, grossAmount: 1000 }),
    tx({ action: "buy", date: "2025-01-06", quantity: 10, grossAmount: 1000 }),
  ];
  const priceHistory = { VTI: series("VTI", [["2025-01-02", 100]]) };
  const spy = series("SPY", [
    ["2025-01-02", 100],
    ["2025-01-03", 100],
    ["2025-01-06", 100],
    ["2025-01-07", 100],
  ]);

  function run(schedule: "deposits-only" | "raw-daily" | "monthly-netted") {
    return computeSyntheticPortfolio(holdings(txs(), priceHistory), {
      label: `SPY ${schedule}`,
      legs: [{ symbol: "SPY", weight: 1 }],
      schedule,
      priceHistory: { SPY: spy },
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });
  }

  it("keeps the deposits-only schedule fully invested through a cash round trip", () => {
    const r = run("deposits-only");
    expect(r.deposits).toHaveLength(1);
    expect(r.totalDepositedUsd).toBeCloseTo(1000, 6);
    expect(r.endValueUsd).toBeCloseTo(1000, 6);
  });

  it("follows the investor into cash under the raw-daily schedule", () => {
    const r = run("raw-daily");
    // Buy, sell out, buy back: three flows, ending fully invested again.
    expect(r.deposits).toHaveLength(2);
    expect(r.endValueUsd).toBeCloseTo(1000, 6);
  });

  it("nets flows within a month under the monthly schedule", () => {
    const r = run("monthly-netted");
    // +1000 -1000 +1000 all land in 2025-01, netting to a single +1000.
    expect(r.deposits).toHaveLength(1);
    expect(r.totalDepositedUsd).toBeCloseTo(1000, 6);
  });

  it("splits contributions across legs by weight", () => {
    const r = computeSyntheticPortfolio(holdings(txs(), priceHistory), {
      label: "60/40",
      legs: [
        { symbol: "SPY", weight: 0.6 },
        { symbol: "BND", weight: 0.4 },
      ],
      schedule: "deposits-only",
      priceHistory: {
        SPY: series("SPY", [["2025-01-02", 100], ["2025-01-07", 200]]),
        BND: series("BND", [["2025-01-02", 100], ["2025-01-07", 100]]),
      },
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });

    // $600 into SPY doubles to $1,200; $400 into BND stays flat.
    expect(r.endValueUsd).toBeCloseTo(1600, 6);
    expect(r.symbol).toBe("SPY/BND");
  });

  it("flags a modelled yield and compounds it into units", () => {
    const withYield = computeSyntheticPortfolio(holdings(txs(), priceHistory), {
      label: "60/40 modelled",
      legs: [
        { symbol: "SPY", weight: 0.6 },
        { symbol: "BND", weight: 0.4, modeledYieldPct: 3.8 },
      ],
      schedule: "deposits-only",
      priceHistory: {
        SPY: series("SPY", [["2025-01-02", 100]]),
        BND: series("BND", [["2025-01-02", 100]]),
      },
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });

    expect(withYield.isModeled).toBe(true);
    expect(withYield.modelNote).toMatch(/BND assumes a 3.8%\/yr distribution yield/);
    // The bond leg accrues, so terminal value exceeds the flat-price case.
    expect(withYield.endValueUsd).toBeGreaterThan(1000);
  });

  it("rebalances annually back to target weights", () => {
    const cal = ["2025-06-02", "2025-12-31", "2026-01-02", "2026-06-01"];
    const buys = [tx({ action: "buy", date: "2025-06-02", quantity: 10, grossAmount: 1000 })];
    const prices = {
      VTI: series("VTI", [["2025-06-02", 100]]),
      AAA: series("AAA", [["2025-06-02", 100], ["2025-12-31", 300], ["2026-06-01", 300]]),
      BBB: series("BBB", [["2025-06-02", 100], ["2025-12-31", 100], ["2026-06-01", 100]]),
    };
    const points = computeDailyHoldings({
      transactions: buys,
      priceHistory: prices,
      fxHistory: NO_FX,
      tradingCalendar: cal,
      endDate: "2026-06-01",
    });

    const rebalanced = computeSyntheticPortfolio(points, {
      label: "50/50 rebalanced",
      legs: [
        { symbol: "AAA", weight: 0.5 },
        { symbol: "BBB", weight: 0.5 },
      ],
      schedule: "deposits-only",
      priceHistory: prices,
      tradingCalendar: cal,
      startDate: "2025-06-02",
      endDate: "2026-06-01",
      rebalance: "annual",
    });

    const drifting = computeSyntheticPortfolio(points, {
      label: "50/50 drifting",
      legs: [
        { symbol: "AAA", weight: 0.5 },
        { symbol: "BBB", weight: 0.5 },
      ],
      schedule: "deposits-only",
      priceHistory: prices,
      tradingCalendar: cal,
      startDate: "2025-06-02",
      endDate: "2026-06-01",
    });

    // Both hold $2,000 at the 2025 close; rebalancing then sells the winner,
    // so with no further moves the terminal values match but the paths differ.
    expect(rebalanced.endValueUsd).toBeCloseTo(2000, 6);
    expect(drifting.endValueUsd).toBeCloseTo(2000, 6);
    expect(rebalanced.deposits).toHaveLength(1);
  });

  it("returns an empty result when no leg has prices", () => {
    const r = computeSyntheticPortfolio(holdings(txs(), priceHistory), {
      label: "missing",
      legs: [{ symbol: "NOPE", weight: 1 }],
      schedule: "deposits-only",
      priceHistory: {},
      tradingCalendar: CAL,
      startDate: "2025-01-02",
      endDate: "2025-01-07",
    });
    expect(r.series).toEqual([]);
    expect(r.endValueUsd).toBe(0);
  });
});
