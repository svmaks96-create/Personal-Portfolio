import { computeDailyHoldings } from "./daily-holdings";
import { computeValueVsCostBasisSeries } from "./twrr";
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
    ticker: "AAA",
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

function series(ticker: string, rows: [string, number][]): MarketDataInput[] {
  return rows.map(([date, value]) => ({ symbol: ticker, date, value }));
}

const CAL = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"];

describe("computeDailyHoldings", () => {
  it("tracks shares, basis and market value per day", () => {
    const txs = [tx({ action: "buy", quantity: 10, grossAmount: 1000, fees: 5 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-02", 100], ["2025-01-03", 110]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    expect(points).toHaveLength(4);
    expect(points[0].totalMarketValueUsd).toBeCloseTo(1000, 6);
    expect(points[0].totalCostBasisUsd).toBeCloseTo(1005, 6);
    expect(points[0].totalExternalFlowUsd).toBeCloseTo(1005, 6);
    expect(points[1].totalMarketValueUsd).toBeCloseTo(1100, 6);
    // Forward-fill carries the last quote once the series stops.
    expect(points[3].totalMarketValueUsd).toBeCloseTo(1100, 6);
  });

  it("matches computeValueVsCostBasisSeries on market value", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000, fees: 2 }),
      tx({ action: "buy", date: "2025-01-03", ticker: "BBB", quantity: 5, grossAmount: 500 }),
      tx({ action: "sell", date: "2025-01-06", quantity: 4, grossAmount: 480 }),
      tx({ action: "dividend", date: "2025-01-06", quantity: 0, grossAmount: 12 }),
    ];
    const priceHistory = {
      AAA: series("AAA", [["2025-01-02", 100], ["2025-01-03", 110], ["2025-01-06", 120]]),
      BBB: series("BBB", [["2025-01-03", 100], ["2025-01-06", 90]]),
    };

    const mine = computeDailyHoldings({
      transactions: txs,
      priceHistory,
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });
    const existing = computeValueVsCostBasisSeries(
      txs,
      priceHistory,
      NO_FX,
      CAL,
      "2025-01-02",
      "2025-01-07"
    );

    for (let i = 0; i < CAL.length; i += 1) {
      expect(mine[i].date).toBe(existing[i].date);
      expect(mine[i].totalMarketValueUsd).toBeCloseTo(existing[i].portfolioValue, 6);
    }
  });

  it("releases cost basis per account, and the chart series now agrees", () => {
    // Same ticker in two brokers at different prices, then a sell in one of
    // them. Pooling by ticker released basis at the blended cross-broker
    // average, leaving $2,000; keying by account releases only that account's
    // own $1,000, leaving Wio's $3,000. computeValueVsCostBasisSeries used to
    // return the pooled figure and now delegates here, so both must agree.
    const txs = [
      tx({ action: "buy", date: "2025-01-02", portfolio: "Wio", quantity: 10, grossAmount: 3000 }),
      tx({
        action: "buy",
        date: "2025-01-02",
        portfolio: "Interactive Brokers",
        quantity: 10,
        grossAmount: 1000,
      }),
      tx({
        action: "sell",
        date: "2025-01-06",
        portfolio: "Interactive Brokers",
        quantity: 10,
        grossAmount: 1200,
      }),
    ];
    const priceHistory = { AAA: series("AAA", [["2025-01-02", 200], ["2025-01-06", 120]]) };

    const mine = computeDailyHoldings({
      transactions: txs,
      priceHistory,
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });
    const pooled = computeValueVsCostBasisSeries(
      txs,
      priceHistory,
      NO_FX,
      CAL,
      "2025-01-02",
      "2025-01-07"
    );

    // IBKR's full $1,000 basis is released, leaving Wio's $3,000 — not the
    // $2,000 the blended walk used to report.
    expect(mine[3].totalCostBasisUsd).toBeCloseTo(3000, 6);
    expect(pooled[3].costBasis).toBeCloseTo(3000, 6);
    expect(mine[3].totalMarketValueUsd).toBeCloseTo(pooled[3].portfolioValue, 6);
  });

  it("keeps the chart series identical to this walk on every day", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000, fees: 3 }),
      tx({ action: "buy", date: "2025-01-03", ticker: "BBB", quantity: 5, grossAmount: 500 }),
      // Dated on a day absent from the calendar — previously dropped outright.
      tx({ action: "sell", date: "2025-01-04", quantity: 4, grossAmount: 480, fees: 1 }),
      tx({ action: "dividend", date: "2025-01-06", quantity: 0, grossAmount: 9 }),
      tx({ action: "fee", date: "2025-01-06", quantity: 0, grossAmount: 2, fees: 2 }),
    ];
    const priceHistory = {
      AAA: series("AAA", [["2025-01-02", 100], ["2025-01-06", 120]]),
      BBB: series("BBB", [["2025-01-03", 100], ["2025-01-07", 90]]),
    };

    const mine = computeDailyHoldings({
      transactions: txs,
      priceHistory,
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });
    const chart = computeValueVsCostBasisSeries(
      txs,
      priceHistory,
      NO_FX,
      CAL,
      "2025-01-02",
      "2025-01-07"
    );

    expect(chart).toHaveLength(mine.length);
    for (let i = 0; i < chart.length; i += 1) {
      expect(chart[i].date).toBe(mine[i].date);
      expect(chart[i].portfolioValue).toBeCloseTo(mine[i].totalMarketValueUsd, 9);
      expect(chart[i].costBasis).toBeCloseTo(mine[i].totalCostBasisUsd, 9);
    }
    // The off-calendar sell landed, so basis fell rather than lingering.
    expect(chart[2].costBasis).toBeLessThan(chart[1].costBasis);
  });

  it("emits external flow with the sign convention capital-in = positive", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000, fees: 5 }),
      tx({ action: "sell", date: "2025-01-06", quantity: 4, grossAmount: 480, fees: 2 }),
      tx({ action: "dividend", date: "2025-01-06", quantity: 0, grossAmount: 12 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-02", 100]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    expect(points[0].totalExternalFlowUsd).toBeCloseTo(1005, 6);
    expect(points[2].totalExternalFlowUsd).toBeCloseTo(-478, 6);
    // Dividends are income, never an external flow.
    expect(points[2].totalDividendUsd).toBeCloseTo(12, 6);
  });

  it("flags a stale quote once the series stops updating", () => {
    const txs = [tx({ action: "buy", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-02", 100]]) },
      fxHistory: NO_FX,
      tradingCalendar: ["2025-01-02", "2025-02-01"],
      endDate: "2025-02-01",
      staleThresholdDays: 7,
    });

    expect(points[0].staleValueShare).toBe(0);
    expect(points[1].staleValueShare).toBe(1);
    expect(points[1].holdings[0].isStale).toBe(true);
    expect(points[1].holdings[0].priceDate).toBe("2025-01-02");
  });

  it("uses the seeded synthetic price when quotes start after the first buy", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-06", 150]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    // Valued at cost until the listing quote arrives, so the listing move
    // lands on the right day instead of collapsing into day 1.
    expect(points[0].totalMarketValueUsd).toBeCloseTo(1000, 6);
    expect(points[2].totalMarketValueUsd).toBeCloseTo(1500, 6);
    expect(points[0].unpricedShareCount).toBe(0);
  });

  it("carries an option at cost without a fresh mark and uses one when present", () => {
    const txs = [
      tx({
        action: "buy",
        date: "2025-01-02",
        ticker: "ARM",
        instrument: "option",
        quantity: 2,
        grossAmount: 2000,
      }),
    ];
    const base = {
      transactions: txs,
      priceHistory: { ARM: series("ARM", [["2025-01-02", 150]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    };

    const atCost = computeDailyHoldings(base);
    expect(atCost[0].totalMarketValueUsd).toBeCloseTo(2000, 6);
    expect(atCost[0].holdings[0].valuedAtCost).toBe(true);

    const marked = computeDailyHoldings({
      ...base,
      optionMarkHistory: { ARM: series("ARM:OPT", [["2025-01-06", 2600]]) },
    });
    expect(marked[2].totalMarketValueUsd).toBeCloseTo(2600, 6);
    expect(marked[2].holdings[0].valuedAtCost).toBe(false);
  });

  it("round-trips a name sold to zero and re-bought", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-03", quantity: 10, grossAmount: 1100 }),
      tx({ action: "buy", date: "2025-01-06", quantity: 5, grossAmount: 600 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        AAA: series("AAA", [["2025-01-02", 100], ["2025-01-03", 110], ["2025-01-06", 120]]),
      },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    expect(points[1].totalMarketValueUsd).toBeCloseTo(0, 6);
    expect(points[1].totalCostBasisUsd).toBeCloseTo(0, 6);
    expect(points[2].totalMarketValueUsd).toBeCloseTo(600, 6);
    expect(points[2].totalCostBasisUsd).toBeCloseTo(600, 6);
  });

  it("folds trades made on non-calendar days into the next trading day", () => {
    // The trading calendar is SPY's quote dates, but the ledger holds trades on
    // days the US market was shut (UAE listings, broker-side rows, the ARM
    // option assignment on 2026-07-17). A date-keyed lookup drops them and the
    // position never closes — which is exactly the defect in the chart engine.
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-04", quantity: 10, grossAmount: 1150 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-02", 100], ["2025-01-06", 120]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL, // 2025-01-04 is absent
      endDate: "2025-01-07",
    });

    expect(points[0].totalMarketValueUsd).toBeCloseTo(1000, 6);
    // The off-calendar sell lands on the next trading day and closes the position.
    expect(points[2].date).toBe("2025-01-06");
    expect(points[2].totalMarketValueUsd).toBeCloseTo(0, 6);
    expect(points[2].totalCostBasisUsd).toBeCloseTo(0, 6);
    expect(points[3].totalMarketValueUsd).toBeCloseTo(0, 6);
  });

  it("still consumes trades dated before the calendar opens", () => {
    const txs = [tx({ action: "buy", date: "2024-12-30", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-02", 100]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
    });

    expect(points[0].totalMarketValueUsd).toBeCloseTo(1000, 6);
    expect(points[0].totalCostBasisUsd).toBeCloseTo(1000, 6);
  });

  it("honours emitFrom while still accruing state from inception", () => {
    const txs = [tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { AAA: series("AAA", [["2025-01-02", 100], ["2025-01-06", 130]]) },
      fxHistory: NO_FX,
      tradingCalendar: CAL,
      endDate: "2025-01-07",
      emitFrom: "2025-01-06",
    });

    expect(points).toHaveLength(2);
    expect(points[0].date).toBe("2025-01-06");
    expect(points[0].totalMarketValueUsd).toBeCloseTo(1300, 6);
  });
});
