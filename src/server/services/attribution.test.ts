import {
  computeAttribution,
  computeDailyContribution,
  SAME_DAY_ENTRY_KEY,
} from "./attribution";
import { computeDailyHoldings, computeTwrrFromHoldings } from "./daily-holdings";
import { sleeveOf, findUnmappedTickers, SLEEVE_ORDER } from "./sleeve-map";
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

describe("sleeveOf", () => {
  it("maps a known ticker and routes any option to the Options sleeve", () => {
    expect(sleeveOf("VTI", "stock")).toBe("Core Index");
    expect(sleeveOf("BND", "stock")).toBe("Bonds & Cash Proxy");
    expect(sleeveOf("NVDA", "stock")).toBe("Core Single Stock");
    expect(sleeveOf("DFM:PARKIN", "stock")).toBe("UAE IPOs");
    // Instrument wins: ARM stock is a satellite, ARM options are options.
    expect(sleeveOf("ARM", "stock")).toBe("Satellite Single Stock");
    expect(sleeveOf("ARM", "option")).toBe("Options");
    // APO only ever existed as an option and has no stock mapping.
    expect(sleeveOf("APO", "option")).toBe("Options");
  });

  it("throws on an unmapped ticker rather than silently bucketing it", () => {
    expect(() => sleeveOf("NEWCO", "stock")).toThrow(/no sleeve mapped/i);
  });

  it("reports unmapped tickers without throwing", () => {
    expect(findUnmappedTickers(["VTI", "NEWCO", "NVDA"])).toEqual(["NEWCO"]);
    expect(findUnmappedTickers(["VTI", "NVDA"])).toEqual([]);
  });

  it("lists every sleeve exactly once in the display order", () => {
    expect(new Set(SLEEVE_ORDER).size).toBe(SLEEVE_ORDER.length);
    expect(SLEEVE_ORDER).toContain("Options");
  });
});

describe("computeAttribution", () => {
  it("decomposes P&L per name and sums to the portfolio total", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-01-02", ticker: "NVDA", quantity: 5, grossAmount: 500 }),
      tx({ action: "dividend", date: "2025-01-06", ticker: "VTI", quantity: 0, grossAmount: 8 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: series("VTI", [["2025-01-02", 100], ["2025-01-07", 120]]),
        NVDA: series("NVDA", [["2025-01-02", 100], ["2025-01-07", 80]]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const result = computeAttribution(points, { groupBy: "ticker" });

    const vti = result.rows.find((r) => r.key === "VTI|stock")!;
    const nvda = result.rows.find((r) => r.key === "NVDA|stock")!;
    expect(vti.pnlUsd).toBeCloseTo(208, 6); // +$200 price, +$8 income
    expect(nvda.pnlUsd).toBeCloseTo(-100, 6);
    expect(result.total.pnlUsd).toBeCloseTo(108, 6);
    expect(result.residualUsd).toBeCloseTo(0, 9);
  });

  it("rolls names up into sleeves without changing the total", () => {
    const txs = [
      tx({ action: "buy", ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", ticker: "VXUS", quantity: 10, grossAmount: 500 }),
      tx({ action: "buy", ticker: "NVDA", quantity: 5, grossAmount: 500 }),
    ];
    const priceHistory = {
      VTI: series("VTI", [["2025-01-02", 100], ["2025-01-07", 110]]),
      VXUS: series("VXUS", [["2025-01-02", 50], ["2025-01-07", 55]]),
      NVDA: series("NVDA", [["2025-01-02", 100], ["2025-01-07", 90]]),
    };
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory,
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const byTicker = computeAttribution(points, { groupBy: "ticker" });
    const bySleeve = computeAttribution(points, { groupBy: "sleeve" });

    expect(bySleeve.rows).toHaveLength(2);
    const core = bySleeve.rows.find((r) => r.key === "Core Index")!;
    expect(core.pnlUsd).toBeCloseTo(150, 6); // VTI +100, VXUS +50
    expect(bySleeve.total.pnlUsd).toBeCloseTo(byTicker.total.pnlUsd, 6);
    expect(bySleeve.residualUsd).toBeCloseTo(0, 9);
  });

  it("nets an inter-broker transfer to roughly zero contribution", () => {
    // Sell in one account, identical buy in the other on the same day.
    // Flows cancel and market value never moves, so the formula needs no
    // special-casing — unlike realized-P&L accounting.
    const txs = [
      tx({ action: "buy", date: "2025-01-02", portfolio: "Wio", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-06", portfolio: "Wio", quantity: 10, grossAmount: 1100 }),
      tx({
        action: "buy",
        date: "2025-01-06",
        portfolio: "Interactive Brokers",
        quantity: 10,
        grossAmount: 1100,
      }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        // Flat at 110 across the transfer, so the window isolates the move
        // itself rather than any price change around it.
        VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 110]]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const byPortfolio = computeAttribution(points, {
      groupBy: "portfolio",
      from: "2025-01-06",
    });

    const wio = byPortfolio.rows.find((r) => r.key === "Wio")!;
    const ibkr = byPortfolio.rows.find((r) => r.key === "Interactive Brokers")!;
    // Neither side books a gain: the sending account's $1,100 opening balance
    // leaves as a $1,100 outflow, and the receiving account's inflow buys an
    // identical $1,100 of stock. Realized-P&L accounting would show a large
    // phantom gain on the Wio leg here.
    expect(wio.pnlUsd).toBeCloseTo(0, 6);
    expect(ibkr.pnlUsd).toBeCloseTo(0, 6);
    expect(byPortfolio.total.pnlUsd).toBeCloseTo(0, 6);
    expect(byPortfolio.residualUsd).toBeCloseTo(0, 9);
  });

  it("still attributes real gains earned before a transfer to the sending account", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", portfolio: "Wio", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-06", portfolio: "Wio", quantity: 10, grossAmount: 1100 }),
      tx({
        action: "buy",
        date: "2025-01-06",
        portfolio: "Interactive Brokers",
        quantity: 10,
        grossAmount: 1100,
      }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: series("VTI", [["2025-01-02", 100], ["2025-01-06", 110]]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const byPortfolio = computeAttribution(points, { groupBy: "portfolio" });
    const wio = byPortfolio.rows.find((r) => r.key === "Wio")!;

    // The $100 move from 100 -> 110 happened while the shares sat in Wio, so
    // it belongs to Wio — the transfer neither creates nor destroys it.
    expect(wio.pnlUsd).toBeCloseTo(100, 6);
    expect(byPortfolio.total.pnlUsd).toBeCloseTo(100, 6);
  });

  it("windows correctly, excluding gains made before `from`", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: series("VTI", [
          ["2025-01-02", 100],
          ["2025-01-03", 150],
          ["2025-01-06", 160],
          ["2025-01-07", 170],
        ]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const full = computeAttribution(points, { groupBy: "ticker" });
    expect(full.total.pnlUsd).toBeCloseTo(700, 6);

    // From 2025-01-06 the opening balance is the 01-03 close of $1,500.
    const partial = computeAttribution(points, { groupBy: "ticker", from: "2025-01-06" });
    expect(partial.total.startMarketValueUsd).toBeCloseTo(1500, 6);
    expect(partial.total.pnlUsd).toBeCloseTo(200, 6);
    expect(partial.residualUsd).toBeCloseTo(0, 9);
  });

  it("respects the `to` bound", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 150], ["2025-01-07", 300]]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const capped = computeAttribution(points, { groupBy: "ticker", to: "2025-01-03" });
    expect(capped.to).toBe("2025-01-03");
    expect(capped.total.pnlUsd).toBeCloseTo(500, 6);
  });

  it("computes return on average capital rather than on end value", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { VTI: series("VTI", [["2025-01-02", 100], ["2025-01-03", 110]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const row = computeAttribution(points, { groupBy: "ticker" }).rows[0];
    // MV path is 1000, 1100, 1100, 1100 -> mean 1075.
    expect(row.avgCapitalUsd).toBeCloseTo(1075, 6);
    expect(row.returnOnAvgCapitalPct).toBeCloseTo((100 / 1075) * 100, 6);
  });

  it("reports days with exposure alongside average capital", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-06", ticker: "NVDA", quantity: 5, grossAmount: 500 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { NVDA: series("NVDA", [["2025-01-06", 100]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const row = computeAttribution(points, { groupBy: "ticker" }).rows[0];
    // Held on only two of the four calendar days.
    expect(row.daysWithExposure).toBe(2);
    expect(row.avgCapitalUsd).toBeCloseTo(500, 6);
  });

  it("groups by sector, routing funds and options to their own buckets", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-01-02", ticker: "NVDA", quantity: 5, grossAmount: 500 }),
      tx({ action: "buy", date: "2025-01-02", ticker: "BABA", quantity: 5, grossAmount: 500 }),
      tx({
        action: "buy",
        date: "2025-01-02",
        ticker: "ARM",
        instrument: "option",
        quantity: 1,
        grossAmount: 300,
      }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: series("VTI", [["2025-01-02", 100]]),
        NVDA: series("NVDA", [["2025-01-02", 100]]),
        BABA: series("BABA", [["2025-01-02", 100]]),
        ARM: series("ARM", [["2025-01-02", 100]]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const result = computeAttribution(points, {
      groupBy: "sector",
      sectorByTicker: { NVDA: "Technology", BABA: "Consumer Cyclical", VTI: "Financial Services" },
    });

    const keys = result.rows.map((r) => r.key).sort();
    // VTI must NOT land in Financial Services just because FMP says so.
    expect(keys).toEqual(["Consumer Cyclical", "Funds & ETFs", "Options", "Technology"]);
  });

  it("labels a stock with no sector data as Unclassified", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", ticker: "NVDA", quantity: 5, grossAmount: 500 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { NVDA: series("NVDA", [["2025-01-02", 100]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    const result = computeAttribution(points, { groupBy: "sector", sectorByTicker: {} });
    expect(result.rows[0].key).toBe("Unclassified");
  });

  it("returns an empty result for an out-of-range window", () => {
    const txs = [tx({ action: "buy", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { VTI: series("VTI", [["2025-01-02", 100]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    expect(computeAttribution(points, { groupBy: "ticker", from: "2030-01-01" }).rows).toEqual([]);
  });
});

describe("computeDailyContribution", () => {
  const LONG_CAL = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(2025, 0, 2 + i)).toISOString().slice(0, 10)
  );

  function prices(ticker: string, values: number[]): MarketDataInput[] {
    return values.map((value, i) => ({ symbol: ticker, date: LONG_CAL[i], value }));
  }

  it("reconciles contributions to the chain-linked total exactly", () => {
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: LONG_CAL[0], ticker: "NVDA", quantity: 5, grossAmount: 500 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: prices("VTI", [100, 102, 101, 105, 104, 108, 110, 109, 112, 115, 114, 118]),
        NVDA: prices("NVDA", [100, 95, 99, 92, 97, 90, 94, 88, 93, 85, 91, 80]),
      },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL,
      endDate: LONG_CAL[11],
    });

    const result = computeDailyContribution(points, { groupBy: "ticker" });

    expect(result.rows).toHaveLength(2);
    // The property that makes the table trustworthy.
    expect(result.residualPct).toBeCloseTo(0, 9);
    const summed = result.rows.reduce((a, r) => a + r.contributionPct, 0);
    expect(summed).toBeCloseTo(result.totalReturnPct, 9);
  });

  it("matches a hand-computed two-asset case", () => {
    // Equal $1,000 halves. Day 2: A +10%, B flat -> portfolio +5%.
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: LONG_CAL[0], ticker: "NVDA", quantity: 10, grossAmount: 1000 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: prices("VTI", [100, 110]),
        NVDA: prices("NVDA", [100, 100]),
      },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 2),
      endDate: LONG_CAL[1],
    });

    const result = computeDailyContribution(points, { groupBy: "ticker" });
    const vti = result.rows.find((r) => r.key === "VTI|stock")!;
    const nvda = result.rows.find((r) => r.key === "NVDA|stock")!;

    expect(result.totalReturnPct).toBeCloseTo(5, 9);
    expect(vti.contributionPct).toBeCloseTo(5, 9);
    expect(nvda.contributionPct).toBeCloseTo(0, 9);
    expect(vti.avgWeightPct).toBeCloseTo(50, 9);
  });

  it("gives a position opened today no weight today", () => {
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      // Bought on day 2 — its arrival must not read as a gain.
      tx({ action: "buy", date: LONG_CAL[1], ticker: "NVDA", quantity: 10, grossAmount: 1000 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: prices("VTI", [100, 100, 100]),
        NVDA: prices("NVDA", [100, 100, 100]),
      },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 3),
      endDate: LONG_CAL[2],
    });

    const result = computeDailyContribution(points, { groupBy: "ticker" });
    // Nothing moved, so the portfolio return is zero despite the inflow.
    expect(result.totalReturnPct).toBeCloseTo(0, 9);
    expect(result.residualPct).toBeCloseTo(0, 9);
  });

  it("rolls contributions up to sleeves with the same total", () => {
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VXUS", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: LONG_CAL[0], ticker: "NVDA", quantity: 10, grossAmount: 1000 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: prices("VTI", [100, 110, 105]),
        VXUS: prices("VXUS", [100, 105, 108]),
        NVDA: prices("NVDA", [100, 90, 95]),
      },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 3),
      endDate: LONG_CAL[2],
    });

    const byTicker = computeDailyContribution(points, { groupBy: "ticker" });
    const bySleeve = computeDailyContribution(points, { groupBy: "sleeve" });

    expect(bySleeve.totalReturnPct).toBeCloseTo(byTicker.totalReturnPct, 9);
    expect(bySleeve.residualPct).toBeCloseTo(0, 9);
    const core = bySleeve.rows.find((r) => r.key === "Core Index")!;
    const vti = byTicker.rows.find((r) => r.key === "VTI|stock")!;
    const vxus = byTicker.rows.find((r) => r.key === "VXUS|stock")!;
    expect(core.contributionPct).toBeCloseTo(vti.contributionPct + vxus.contributionPct, 9);
  });

  it("handles a zero-return day without dividing by zero", () => {
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { VTI: prices("VTI", [100, 100, 100]) },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 3),
      endDate: LONG_CAL[2],
    });

    const result = computeDailyContribution(points, { groupBy: "ticker" });
    expect(Number.isFinite(result.totalReturnPct)).toBe(true);
    expect(result.totalReturnPct).toBeCloseTo(0, 9);
    expect(result.residualPct).toBeCloseTo(0, 9);
  });

  it("reports the same total return regardless of grouping", () => {
    // Grouping is an aggregation, so it must not change the portfolio's return.
    // A per-bucket dollar floor would break this: a sleeve clears it more often
    // than an individual ticker does.
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VXUS", quantity: 10, grossAmount: 500 }),
      tx({ action: "buy", date: LONG_CAL[0], ticker: "NVDA", quantity: 5, grossAmount: 250 }),
      // A deliberately tiny position, well under any plausible floor.
      tx({ action: "buy", date: LONG_CAL[0], ticker: "SPCX", quantity: 1, grossAmount: 0.4 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: prices("VTI", [100, 104, 103]),
        VXUS: prices("VXUS", [50, 52, 49]),
        NVDA: prices("NVDA", [50, 46, 53]),
        SPCX: prices("SPCX", [0.4, 0.9, 0.2]),
      },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 3),
      endDate: LONG_CAL[2],
    });

    const byTicker = computeDailyContribution(points, { groupBy: "ticker" });
    const bySleeve = computeDailyContribution(points, { groupBy: "sleeve" });
    const byPortfolio = computeDailyContribution(points, { groupBy: "portfolio" });

    expect(bySleeve.totalReturnPct).toBeCloseTo(byTicker.totalReturnPct, 9);
    expect(byPortfolio.totalReturnPct).toBeCloseTo(byTicker.totalReturnPct, 9);
    expect(byTicker.residualPct).toBeCloseTo(0, 9);
    expect(bySleeve.residualPct).toBeCloseTo(0, 9);
  });

  it("ties to the portfolio TWRR even when positions open mid-window", () => {
    // A position bought today has market value at the close but cash flow at
    // the fill price. That intraday move belongs to the portfolio's return but
    // has no prior-day weight, so it is booked to an explicit bucket rather
    // than dropped — otherwise the contribution total drifts from the TWRR.
    const txs = [
      tx({ action: "buy", date: LONG_CAL[0], ticker: "VTI", quantity: 10, grossAmount: 1000 }),
      // Bought at 40 but closes at 50 the same day.
      tx({ action: "buy", date: LONG_CAL[1], ticker: "NVDA", quantity: 10, grossAmount: 400 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: prices("VTI", [100, 100, 100]),
        NVDA: prices("NVDA", [50, 50, 50]),
      },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 3),
      endDate: LONG_CAL[2],
    });

    const twrr = computeTwrrFromHoldings(points);
    const expectedPct = (twrr[twrr.length - 1].growthOfDollar - 1) * 100;

    const byTicker = computeDailyContribution(points, { groupBy: "ticker" });
    const bySleeve = computeDailyContribution(points, { groupBy: "sleeve" });

    expect(byTicker.totalReturnPct).toBeCloseTo(expectedPct, 9);
    expect(bySleeve.totalReturnPct).toBeCloseTo(expectedPct, 9);

    // The $100 intraday gain is attributed, not silently discarded.
    const sameDay = byTicker.rows.find((r) => r.key === SAME_DAY_ENTRY_KEY);
    expect(sameDay).toBeDefined();
    expect(sameDay!.contributionPct).toBeCloseTo(10, 6); // $100 on a $1,000 base
  });

  it("returns empty for a window with fewer than two points", () => {
    const txs = [tx({ action: "buy", date: LONG_CAL[0], quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { VTI: prices("VTI", [100]) },
      fxHistory: NO_FX,
      tradingCalendar: LONG_CAL.slice(0, 1),
      endDate: LONG_CAL[0],
    });

    expect(computeDailyContribution(points, { groupBy: "ticker" }).rows).toEqual([]);
  });
});
