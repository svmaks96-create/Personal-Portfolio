import { detectTransferPairs } from "./transfer-detection";
import type { TransactionInput } from "@/server/types/positions";

let nextId = 1;
function tx(
  overrides: Partial<TransactionInput> & Pick<TransactionInput, "action">
): TransactionInput {
  return {
    id: nextId++,
    date: "2025-12-10",
    ticker: "VTI",
    instrument: "stock",
    quantity: 0,
    grossAmount: 0,
    fees: 0,
    portfolio: "Interactive Brokers",
    currency: "USD",
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

describe("detectTransferPairs", () => {
  it("detects a same-day cross-portfolio offset at identical price", () => {
    const sell = tx({
      action: "sell",
      portfolio: "Wio",
      quantity: 10,
      grossAmount: 2515.2,
    });
    const buy = tx({
      action: "buy",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 2515.2,
    });

    const result = detectTransferPairs([sell, buy]);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({
      ticker: "VTI",
      gapDays: 0,
      qtyMatched: 10,
      sellPortfolio: "Wio",
      buyPortfolio: "Interactive Brokers",
      confidence: "high",
    });
    expect(result.pairs[0].priceDeltaPct).toBeCloseTo(0, 10);
    expect(result.legTxIds).toEqual(new Set([sell.id, buy.id]));
    expect(result.totalSellUsd).toBeCloseTo(2515.2, 6);
    expect(result.totalBuyUsd).toBeCloseTo(2515.2, 6);
  });

  it("does NOT flag a same-day sell+buy inside a single portfolio", () => {
    // The BABA 2021-12-31 / NVDA 2025-08-01 pattern — genuine trades.
    const sell = tx({
      action: "sell",
      portfolio: "Interactive Brokers",
      quantity: 1,
      grossAmount: 251.52,
    });
    const buy = tx({
      action: "buy",
      portfolio: "Interactive Brokers",
      quantity: 2,
      grossAmount: 503.04,
    });

    const result = detectTransferPairs([sell, buy]);

    expect(result.pairs).toEqual([]);
    expect(result.legTxIds.size).toBe(0);
    expect(result.totalSellUsd).toBe(0);
  });

  it("matches legs one day apart and grades them medium", () => {
    const sell = tx({
      action: "sell",
      date: "2025-12-09",
      portfolio: "Interactive Brokers",
      quantity: 100,
      grossAmount: 29467,
    });
    const buy = tx({
      action: "buy",
      date: "2025-12-10",
      portfolio: "Wio",
      quantity: 100,
      grossAmount: 29500,
    });

    const result = detectTransferPairs([sell, buy]);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].gapDays).toBe(1);
    expect(result.pairs[0].confidence).toBe("medium");
  });

  it("rejects legs outside the date window", () => {
    const sell = tx({
      action: "sell",
      date: "2025-08-05",
      portfolio: "Wio",
      quantity: 10,
      grossAmount: 1000,
    });
    const buy = tx({
      action: "buy",
      date: "2025-11-24",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1000,
    });

    expect(detectTransferPairs([sell, buy]).pairs).toEqual([]);
  });

  it("rejects legs whose prices diverge beyond tolerance", () => {
    const sell = tx({
      action: "sell",
      portfolio: "Wio",
      quantity: 10,
      grossAmount: 1000,
    });
    const buy = tx({
      action: "buy",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1500, // +50%
    });

    expect(detectTransferPairs([sell, buy]).pairs).toEqual([]);
  });

  it("leaves the residual of a partial match as a real trade", () => {
    const sell = tx({
      action: "sell",
      portfolio: "Wio",
      quantity: 30,
      grossAmount: 3000,
    });
    const buy = tx({
      action: "buy",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1000,
    });

    const result = detectTransferPairs([sell, buy]);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].qtyMatched).toBe(10);
    // The buy is fully consumed; the sell keeps a 20-share residual and must
    // stay in the decision universe.
    expect(result.legTxIds.has(buy.id)).toBe(true);
    expect(result.legTxIds.has(sell.id)).toBe(false);
    expect(result.matchedQtyByTxId.get(sell.id)).toBe(10);
  });

  it("never matches a leg against itself or across tickers", () => {
    const sell = tx({
      action: "sell",
      ticker: "VTI",
      portfolio: "Wio",
      quantity: 10,
      grossAmount: 1000,
    });
    const buy = tx({
      action: "buy",
      ticker: "VXUS",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1000,
    });

    expect(detectTransferPairs([sell, buy]).pairs).toEqual([]);
  });

  it("keeps stock and option legs on the same underlying separate", () => {
    const sell = tx({
      action: "sell",
      ticker: "ARM",
      instrument: "option",
      portfolio: "Wio",
      quantity: 5,
      grossAmount: 500,
    });
    const buy = tx({
      action: "buy",
      ticker: "ARM",
      instrument: "stock",
      portfolio: "Interactive Brokers",
      quantity: 5,
      grossAmount: 500,
    });

    expect(detectTransferPairs([sell, buy]).pairs).toEqual([]);
  });

  it("prefers the closest-dated buy, then the smallest price divergence", () => {
    const sell = tx({
      action: "sell",
      date: "2025-12-10",
      portfolio: "Wio",
      quantity: 10,
      grossAmount: 1000,
    });
    const farBuy = tx({
      action: "buy",
      date: "2025-12-12",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1000,
    });
    const nearBuy = tx({
      action: "buy",
      date: "2025-12-10",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1020,
    });

    const result = detectTransferPairs([sell, farBuy, nearBuy]);

    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0].buyTxId).toBe(nearBuy.id);
  });

  it("ignores dividend and fee rows entirely", () => {
    const div = tx({
      action: "dividend",
      portfolio: "Wio",
      quantity: 0,
      grossAmount: 25,
    });
    const buy = tx({
      action: "buy",
      portfolio: "Interactive Brokers",
      quantity: 10,
      grossAmount: 1000,
    });

    expect(detectTransferPairs([div, buy]).pairs).toEqual([]);
  });
});
