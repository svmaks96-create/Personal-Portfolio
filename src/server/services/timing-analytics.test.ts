import {
  computeEntryTiming,
  computeExitTiming,
  SMA_LONG,
  SMA_SHORT,
} from "./timing-analytics";
import type { TransactionInput, MarketDataInput } from "@/server/types/positions";

let nextId = 1;
function tx(
  o: Partial<TransactionInput> & Pick<TransactionInput, "action">
): TransactionInput {
  return {
    id: nextId++,
    date: "2025-06-02",
    ticker: "AAA",
    instrument: "stock",
    quantity: 0,
    grossAmount: 0,
    fees: 0,
    portfolio: "Test",
    currency: "USD",
    ...o,
  };
}

beforeEach(() => {
  nextId = 1;
});

/** Flat price series of `n` daily observations starting 2025-01-01. */
function flatSeries(symbol: string, n: number, value: number): MarketDataInput[] {
  return Array.from({ length: n }, (_, i) => ({
    symbol,
    date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
    value,
  }));
}

function dateAt(offset: number): string {
  return new Date(Date.UTC(2025, 0, 1 + offset)).toISOString().slice(0, 10);
}

describe("computeEntryTiming", () => {
  it("measures the fill against the 50- and 200-day averages", () => {
    // 250 flat days at 100, so both averages sit exactly at 100.
    const prices = flatSeries("AAA", 250, 100);
    const buy = tx({
      action: "buy",
      date: dateAt(249),
      quantity: 10,
      grossAmount: 1100, // fill at 110, i.e. 10% above both averages
    });

    const result = computeEntryTiming([buy], {
      priceHistory: { AAA: prices },
      benchmarkSeries: flatSeries("SPY", 250, 500),
    });

    const row = result.rows[0];
    expect(row.sma50).toBeCloseTo(100, 9);
    expect(row.sma200).toBeCloseTo(100, 9);
    expect(row.fillPrice).toBeCloseTo(110, 9);
    expect(row.pctVs50dma).toBeCloseTo(10, 9);
    expect(row.pctVs200dma).toBeCloseTo(10, 9);
    expect(result.dollarsAbove200dmaPct).toBeCloseTo(100, 9);
  });

  it("returns null averages when history is too short and reports coverage", () => {
    const prices = flatSeries("AAA", 30, 100);
    const buy = tx({ action: "buy", date: dateAt(29), quantity: 1, grossAmount: 100 });

    const result = computeEntryTiming([buy], {
      priceHistory: { AAA: prices },
      benchmarkSeries: flatSeries("SPY", 30, 500),
    });

    expect(result.rows[0].sma50).toBeNull();
    expect(result.rows[0].sma200).toBeNull();
    expect(result.coverage.n).toBe(1);
    expect(result.coverage.withSma50).toBe(0);
    expect(result.coverage.withSma200).toBe(0);
    expect(result.coverage.missingByTicker).toEqual([
      { ticker: "AAA", missingSma200: 1, buys: 1 },
    ]);
    // With no eligible rows the dollar share must be null, not zero.
    expect(result.dollarsAbove200dmaPct).toBeNull();
  });

  it("weights the above/below split by dollars, not by trade count", () => {
    const prices = flatSeries("AAA", 250, 100);
    const txs = [
      // Two small buys below the average.
      tx({ action: "buy", date: dateAt(249), quantity: 1, grossAmount: 90 }),
      tx({ action: "buy", date: dateAt(249), quantity: 1, grossAmount: 90 }),
      // One large buy above it.
      tx({ action: "buy", date: dateAt(249), quantity: 100, grossAmount: 11000 }),
    ];

    const result = computeEntryTiming(txs, {
      priceHistory: { AAA: prices },
      benchmarkSeries: flatSeries("SPY", 250, 500),
    });

    // 2 of 3 trades are below, but 98.4% of the dollars are above.
    expect(result.dollarsAbove200dmaPct).toBeCloseTo((11000 / 11180) * 100, 6);
  });

  it("computes relative strength against the benchmark", () => {
    const rising: MarketDataInput[] = Array.from({ length: 250 }, (_, i) => ({
      symbol: "AAA",
      date: dateAt(i),
      value: 100 * Math.pow(1.002, i),
    }));
    const buy = tx({ action: "buy", date: dateAt(249), quantity: 1, grossAmount: 160 });

    const result = computeEntryTiming([buy], {
      priceHistory: { AAA: rising },
      benchmarkSeries: flatSeries("SPY", 250, 500),
    });

    expect(result.rows[0].trailing3mReturnPct!).toBeGreaterThan(0);
    // SPY is flat, so relative strength equals the raw trailing return.
    expect(result.rows[0].trailing3mVsSpyPct).toBeCloseTo(
      result.rows[0].trailing3mReturnPct!,
      9
    );
  });

  it("measures drawdown from the trailing 52-week high", () => {
    const prices: MarketDataInput[] = [
      ...Array.from({ length: 100 }, (_, i) => ({
        symbol: "AAA",
        date: dateAt(i),
        value: 200,
      })),
      { symbol: "AAA", date: dateAt(100), value: 150 },
    ];
    const buy = tx({ action: "buy", date: dateAt(100), quantity: 1, grossAmount: 150 });

    const result = computeEntryTiming([buy], {
      priceHistory: { AAA: prices },
      benchmarkSeries: flatSeries("SPY", 101, 500),
    });

    expect(result.rows[0].drawdownFrom52wHighPct).toBeCloseTo(-25, 9);
  });

  it("excludes transfer legs from the entry sample", () => {
    const prices = flatSeries("AAA", 250, 100);
    const real = tx({ action: "buy", date: dateAt(249), quantity: 1, grossAmount: 100 });
    const transfer = tx({ action: "buy", date: dateAt(249), quantity: 50, grossAmount: 5000 });

    const result = computeEntryTiming([real, transfer], {
      priceHistory: { AAA: prices },
      benchmarkSeries: flatSeries("SPY", 250, 500),
      excludeTxIds: new Set([transfer.id]),
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].txId).toBe(real.id);
  });

  it("ignores sells and option rows", () => {
    const prices = flatSeries("AAA", 250, 100);
    const txs = [
      tx({ action: "sell", date: dateAt(249), quantity: 1, grossAmount: 100 }),
      tx({
        action: "buy",
        date: dateAt(249),
        instrument: "option",
        quantity: 1,
        grossAmount: 500,
      }),
    ];
    const result = computeEntryTiming(txs, {
      priceHistory: { AAA: prices },
      benchmarkSeries: flatSeries("SPY", 250, 500),
    });
    expect(result.rows).toEqual([]);
  });

  it("exposes the window constants it documents", () => {
    expect(SMA_SHORT).toBe(50);
    expect(SMA_LONG).toBe(200);
  });
});

describe("computeExitTiming", () => {
  it("measures forward return and excess against the benchmark", () => {
    // Ticker doubles over the next 30 days; SPY rises 10%.
    const prices: MarketDataInput[] = [
      { symbol: "AAA", date: "2025-01-01", value: 100 },
      { symbol: "AAA", date: "2025-01-31", value: 200 },
      { symbol: "AAA", date: "2025-06-30", value: 200 },
    ];
    const spy: MarketDataInput[] = [
      { symbol: "SPY", date: "2025-01-01", value: 100 },
      { symbol: "SPY", date: "2025-01-31", value: 110 },
      { symbol: "SPY", date: "2025-06-30", value: 110 },
    ];
    const sell = tx({
      action: "sell",
      date: "2025-01-01",
      quantity: 10,
      grossAmount: 1000,
    });

    const result = computeExitTiming([sell], {
      priceHistory: { AAA: prices },
      benchmarkSeries: spy,
      horizons: [30],
    });

    const h = result.rows[0].horizons[0];
    expect(h.windowComplete).toBe(true);
    expect(h.forwardReturnPct).toBeCloseTo(100, 6);
    expect(h.benchmarkReturnPct).toBeCloseTo(10, 6);
    expect(h.excessPct).toBeCloseTo(90, 6);
    // Selling $1,000 that then beat the index by 90% cost $900.
    expect(h.regretUsd).toBeCloseTo(900, 6);
    expect(result.byHorizon[0].soldTooEarlyCount).toBe(1);
  });

  it("EXCLUDES an incomplete window rather than truncating it", () => {
    const prices: MarketDataInput[] = [
      { symbol: "AAA", date: "2025-01-01", value: 100 },
      { symbol: "AAA", date: "2025-01-20", value: 150 },
    ];
    const spy: MarketDataInput[] = [
      { symbol: "SPY", date: "2025-01-01", value: 100 },
      { symbol: "SPY", date: "2025-01-20", value: 101 },
    ];
    const sell = tx({ action: "sell", date: "2025-01-01", quantity: 10, grossAmount: 1000 });

    const result = computeExitTiming([sell], {
      priceHistory: { AAA: prices },
      benchmarkSeries: spy,
      horizons: [90],
    });

    const h = result.rows[0].horizons[0];
    expect(h.windowComplete).toBe(false);
    // The +50% move so far must NOT leak into the 90-day figure.
    expect(h.forwardReturnPct).toBeNull();
    expect(h.excessPct).toBeNull();
    expect(h.regretUsd).toBeNull();

    const summary = result.byHorizon[0];
    expect(summary.n).toBe(1);
    expect(summary.nComplete).toBe(0);
    expect(summary.nIncompleteExcluded).toBe(1);
    expect(summary.meanExcessPct).toBeNull();
    expect(summary.totalRegretUsd).toBe(0);
  });

  it("records a well-timed exit as negative excess", () => {
    const prices: MarketDataInput[] = [
      { symbol: "AAA", date: "2025-01-01", value: 100 },
      { symbol: "AAA", date: "2025-01-31", value: 60 },
      { symbol: "AAA", date: "2025-06-30", value: 60 },
    ];
    const spy: MarketDataInput[] = [
      { symbol: "SPY", date: "2025-01-01", value: 100 },
      { symbol: "SPY", date: "2025-01-31", value: 105 },
      { symbol: "SPY", date: "2025-06-30", value: 105 },
    ];
    const sell = tx({ action: "sell", date: "2025-01-01", quantity: 10, grossAmount: 1000 });

    const result = computeExitTiming([sell], {
      priceHistory: { AAA: prices },
      benchmarkSeries: spy,
      horizons: [30],
    });

    expect(result.rows[0].horizons[0].excessPct).toBeCloseTo(-45, 6);
    expect(result.byHorizon[0].soldWellCount).toBe(1);
    expect(result.byHorizon[0].totalRegretUsd).toBeCloseTo(-450, 6);
  });

  it("labels full exits separately from trims", () => {
    const prices: MarketDataInput[] = [
      { symbol: "AAA", date: "2025-01-01", value: 100 },
      { symbol: "AAA", date: "2025-06-30", value: 100 },
    ];
    const spy: MarketDataInput[] = [
      { symbol: "SPY", date: "2025-01-01", value: 100 },
      { symbol: "SPY", date: "2025-06-30", value: 100 },
    ];
    const trim = tx({ action: "sell", date: "2025-01-01", quantity: 1, grossAmount: 100 });
    const exit = tx({ action: "sell", date: "2025-01-01", quantity: 9, grossAmount: 900 });

    const result = computeExitTiming([trim, exit], {
      priceHistory: { AAA: prices },
      benchmarkSeries: spy,
      horizons: [30],
      closingTxIds: new Set([exit.id]),
    });

    expect(result.rows.find((r) => r.txId === trim.id)!.exitType).toBe("trim");
    expect(result.rows.find((r) => r.txId === exit.id)!.exitType).toBe("full-exit");
    expect(result.byExitType.find((b) => b.exitType === "full-exit")!.n).toBe(1);
  });

  it("excludes transfer legs from the exit sample", () => {
    const prices: MarketDataInput[] = [
      { symbol: "AAA", date: "2025-01-01", value: 100 },
      { symbol: "AAA", date: "2025-06-30", value: 100 },
    ];
    const real = tx({ action: "sell", date: "2025-01-01", quantity: 1, grossAmount: 100 });
    const transfer = tx({ action: "sell", date: "2025-01-01", quantity: 50, grossAmount: 5000 });

    const result = computeExitTiming([real, transfer], {
      priceHistory: { AAA: prices },
      benchmarkSeries: [
        { symbol: "SPY", date: "2025-01-01", value: 100 },
        { symbol: "SPY", date: "2025-06-30", value: 100 },
      ],
      horizons: [30],
      excludeTxIds: new Set([transfer.id]),
    });

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].txId).toBe(real.id);
  });
});
