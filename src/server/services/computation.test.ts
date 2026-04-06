import { computePositions, computeAggregates } from "./computation";
import type {
  TransactionInput,
  MarketDataInput,
} from "@/server/types/positions";

// Helper to build a transaction
function tx(
  overrides: Partial<TransactionInput> & Pick<TransactionInput, "action">
): TransactionInput {
  return {
    id: 1,
    date: "2025-06-15",
    ticker: "AAPL",
    quantity: 0,
    price: 0,
    fees: 0,
    portfolio: "Test",
    currency: "USD",
    ...overrides,
  };
}

describe("computePositions", () => {
  it("computes buy accumulation and average entry price", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-06-15", action: "buy", quantity: 50, price: 185.5, fees: 4.99 }),
      tx({ id: 2, date: "2025-09-20", action: "buy", quantity: 30, price: 192.0, fees: 4.99 }),
    ];

    const positions = computePositions(transactions, {});

    expect(positions).toHaveLength(1);
    const pos = positions[0];
    expect(pos.sharesHeld).toBe(80);
    // cost = (50*185.5 + 4.99) + (30*192 + 4.99) = 9279.99 + 5764.99 = 15044.98
    expect(pos.costBasis).toBeCloseTo(15044.98, 2);
    expect(pos.avgEntryPrice).toBeCloseTo(15044.98 / 80, 4);
    expect(pos.totalInvested).toBeCloseTo(15044.98, 2);
  });

  it("reduces cost basis proportionally on sell and tracks proceeds", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-06-15", action: "buy", quantity: 50, price: 185.5, fees: 4.99 }),
      tx({ id: 2, date: "2025-09-20", action: "buy", quantity: 30, price: 192.0, fees: 4.99 }),
      tx({ id: 3, date: "2025-12-10", action: "sell", quantity: 20, price: 210.75, fees: 4.99 }),
    ];

    const positions = computePositions(transactions, {});
    const pos = positions[0];

    expect(pos.sharesHeld).toBe(60);
    // sell proceeds = 20 * 210.75 - 4.99 = 4210.01
    expect(pos.totalSellProceeds).toBeCloseTo(4210.01, 2);
    // cost basis reduced by 20/80 * 15044.98 = 3761.245
    expect(pos.costBasis).toBeCloseTo(15044.98 - 3761.245, 2);
    // avg entry unchanged after sell
    expect(pos.avgEntryPrice).toBeCloseTo(15044.98 / 80, 4);
  });

  it("accumulates net dividends per position", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-06-15", action: "buy", quantity: 60, price: 100, fees: 0 }),
      tx({ id: 2, date: "2025-09-20", action: "dividend", quantity: 60, price: 0.25, fees: 0 }),
    ];

    const positions = computePositions(transactions, {});
    // dividend = 60 * 0.25 = 15
    expect(positions[0].totalDividends).toBeCloseTo(15, 2);
  });

  it("increases cost basis and avg entry for standalone fees", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-07-01", ticker: "MSFT", action: "buy", quantity: 25, price: 340, fees: 4.99 }),
      tx({ id: 2, date: "2026-01-20", ticker: "MSFT", action: "fee", quantity: 0, price: 0, fees: 12.5 }),
    ];

    const positions = computePositions(transactions, {});
    const pos = positions[0];

    // cost = 25*340 + 4.99 = 8504.99, then + 12.50 fee = 8517.49
    expect(pos.costBasis).toBeCloseTo(8517.49, 2);
    expect(pos.avgEntryPrice).toBeCloseTo(8517.49 / 25, 4);
    expect(pos.totalInvested).toBeCloseTo(8517.49, 2);
  });

  it("handles fee row division-by-zero safely (quantity 0)", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, action: "fee", quantity: 0, price: 0, fees: 10 }),
    ];

    // Fee-only with no shares — should not crash
    const positions = computePositions(transactions, {});
    expect(positions).toHaveLength(1);
    expect(positions[0].costBasis).toBeCloseTo(10, 2);
    expect(positions[0].sharesHeld).toBe(0);
    expect(positions[0].avgEntryPrice).toBe(0);
  });

  it("computes market value and total P&L when market data available", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-06-15", action: "buy", quantity: 50, price: 185.5, fees: 4.99 }),
      tx({ id: 2, date: "2025-09-20", action: "buy", quantity: 30, price: 192.0, fees: 4.99 }),
      tx({ id: 3, date: "2025-12-10", action: "sell", quantity: 20, price: 210.75, fees: 4.99 }),
      tx({ id: 4, date: "2026-01-15", action: "dividend", quantity: 60, price: 0.25, fees: 0 }),
    ];

    const marketData: Record<string, MarketDataInput> = {
      AAPL: { symbol: "AAPL", value: 215.3 },
    };

    const positions = computePositions(transactions, marketData);
    const pos = positions[0];

    expect(pos.lastPrice).toBe(215.3);
    expect(pos.marketValue).toBeCloseTo(60 * 215.3, 2); // 12918
    // totalPnl = (marketValue + dividends + sellProceeds) - totalInvested
    // = (12918 + 15 + 4210.01) - 15044.98 = 2098.03
    expect(pos.totalPnl).toBeCloseTo(2098.03, 2);
    expect(pos.cashReturned).toBeCloseTo(15 + 4210.01, 2);
  });

  it("returns null for price-dependent fields when no market data", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, action: "buy", quantity: 10, price: 100, fees: 0 }),
    ];

    const positions = computePositions(transactions, {});
    const pos = positions[0];

    expect(pos.lastPrice).toBeNull();
    expect(pos.marketValue).toBeNull();
    expect(pos.totalPnl).toBeNull();
  });

  it("isolates same ticker across different portfolios", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, action: "buy", quantity: 50, price: 185.5, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 2, action: "buy", quantity: 15, price: 195, fees: 9.99, portfolio: "UK Income" }),
    ];

    const positions = computePositions(transactions, {});
    expect(positions).toHaveLength(2);

    const usPos = positions.find((p) => p.portfolio === "US Growth")!;
    const ukPos = positions.find((p) => p.portfolio === "UK Income")!;

    expect(usPos.sharesHeld).toBe(50);
    expect(ukPos.sharesHeld).toBe(15);
    expect(ukPos.costBasis).toBeCloseTo(15 * 195 + 9.99, 2);
  });

  it("identifies closed positions (all shares sold)", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-05-10", ticker: "VOD.L", action: "buy", quantity: 500, price: 0.72, fees: 8, currency: "GBP" }),
      tx({ id: 2, date: "2025-08-15", ticker: "VOD.L", action: "dividend", quantity: 500, price: 0.02, fees: 0, currency: "GBP" }),
      tx({ id: 3, date: "2025-11-20", ticker: "VOD.L", action: "sell", quantity: 500, price: 0.85, fees: 8, currency: "GBP" }),
    ];

    const positions = computePositions(transactions, {});
    const pos = positions[0];

    expect(pos.isClosed).toBe(true);
    expect(pos.sharesHeld).toBe(0);
    // cost = 500*0.72 + 8 = 368
    expect(pos.costBasis).toBeCloseTo(0, 2); // fully reduced
    expect(pos.totalDividends).toBeCloseTo(10, 2);
    expect(pos.totalSellProceeds).toBeCloseTo(500 * 0.85 - 8, 2); // 417
    expect(pos.totalInvested).toBeCloseTo(368, 2);
  });

  it("flags negative share state from sell exceeding held shares", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-01-01", action: "buy", quantity: 10, price: 100, fees: 0 }),
      tx({ id: 2, date: "2025-06-01", action: "sell", quantity: 15, price: 110, fees: 0 }),
    ];

    const positions = computePositions(transactions, {});
    expect(positions[0].hasInvalidState).toBe(true);
  });

  it("handles dividend withholding tax (negative price)", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-01-01", action: "buy", quantity: 100, price: 50, fees: 0 }),
      tx({ id: 2, date: "2025-06-01", action: "dividend", quantity: 100, price: 1.0, fees: 0 }),
      tx({ id: 3, date: "2025-06-01", action: "dividend", quantity: 100, price: -0.15, fees: 0 }),
    ];

    const positions = computePositions(transactions, {});
    // Net dividend = 100*1.0 + 100*(-0.15) = 100 - 15 = 85
    expect(positions[0].totalDividends).toBeCloseTo(85, 2);
  });

  it("computes realized P&L for closed positions without market data", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-05-10", ticker: "VOD.L", action: "buy", quantity: 500, price: 0.72, fees: 8, currency: "GBP" }),
      tx({ id: 2, date: "2025-08-15", ticker: "VOD.L", action: "dividend", quantity: 500, price: 0.02, fees: 0, currency: "GBP" }),
      tx({ id: 3, date: "2025-11-20", ticker: "VOD.L", action: "sell", quantity: 500, price: 0.85, fees: 8, currency: "GBP" }),
    ];

    // No market data — closed position should still have P&L
    const positions = computePositions(transactions, {});
    const pos = positions[0];

    expect(pos.isClosed).toBe(true);
    expect(pos.marketValue).toBe(0);
    // realized P&L = (0 + 10 + 417) - 368 = 59
    expect(pos.totalPnl).toBeCloseTo(59, 2);
  });

  it("returns empty array for empty transactions", () => {
    const positions = computePositions([], {});
    expect(positions).toHaveLength(0);
  });

  it("sorts transactions chronologically before processing", () => {
    // Out-of-order: sell before buy by date
    const transactions: TransactionInput[] = [
      tx({ id: 2, date: "2025-09-01", action: "sell", quantity: 5, price: 110, fees: 0 }),
      tx({ id: 1, date: "2025-01-01", action: "buy", quantity: 10, price: 100, fees: 0 }),
    ];

    const positions = computePositions(transactions, {});
    // Should be sorted: buy first, then sell
    expect(positions[0].sharesHeld).toBe(5);
    expect(positions[0].hasInvalidState).toBe(false);
  });

  it("processes all four action types correctly (seed data integration)", () => {
    // Full US Growth AAPL scenario from seed data
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-06-15", action: "buy", quantity: 50, price: 185.5, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 2, date: "2025-09-20", action: "buy", quantity: 30, price: 192.0, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 3, date: "2025-12-10", action: "sell", quantity: 20, price: 210.75, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 4, date: "2026-01-15", action: "dividend", quantity: 60, price: 0.25, fees: 0, portfolio: "US Growth" }),
      // MSFT with standalone fee
      tx({ id: 5, date: "2025-07-01", ticker: "MSFT", action: "buy", quantity: 25, price: 340, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 6, date: "2025-10-15", ticker: "MSFT", action: "dividend", quantity: 25, price: 0.75, fees: 0, portfolio: "US Growth" }),
      tx({ id: 7, date: "2026-01-20", ticker: "MSFT", action: "fee", quantity: 0, price: 0, fees: 12.5, portfolio: "US Growth" }),
    ];

    const marketData: Record<string, MarketDataInput> = {
      AAPL: { symbol: "AAPL", value: 215.3 },
      MSFT: { symbol: "MSFT", value: 365.8 },
    };

    const positions = computePositions(transactions, marketData);
    expect(positions).toHaveLength(2);

    const aapl = positions.find((p) => p.ticker === "AAPL")!;
    expect(aapl.sharesHeld).toBe(60);
    expect(aapl.totalPnl).toBeCloseTo(2098.03, 2);

    const msft = positions.find((p) => p.ticker === "MSFT")!;
    expect(msft.sharesHeld).toBe(25);
    expect(msft.costBasis).toBeCloseTo(8517.49, 2);
    expect(msft.totalDividends).toBeCloseTo(18.75, 2);
    // P&L = (9145 + 18.75 + 0) - 8517.49 = 646.26
    expect(msft.totalPnl).toBeCloseTo(646.26, 2);
  });

  it("full seed data integration — all 5 positions across 3 portfolios", () => {
    const transactions: TransactionInput[] = [
      // US Growth — AAPL
      tx({ id: 1, date: "2025-06-15", ticker: "AAPL", action: "buy", quantity: 50, price: 185.5, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 2, date: "2025-09-20", ticker: "AAPL", action: "buy", quantity: 30, price: 192.0, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 3, date: "2025-12-10", ticker: "AAPL", action: "sell", quantity: 20, price: 210.75, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 4, date: "2026-01-15", ticker: "AAPL", action: "dividend", quantity: 60, price: 0.25, fees: 0, portfolio: "US Growth" }),
      // US Growth — MSFT
      tx({ id: 5, date: "2025-07-01", ticker: "MSFT", action: "buy", quantity: 25, price: 340, fees: 4.99, portfolio: "US Growth" }),
      tx({ id: 6, date: "2025-10-15", ticker: "MSFT", action: "dividend", quantity: 25, price: 0.75, fees: 0, portfolio: "US Growth" }),
      tx({ id: 7, date: "2026-01-20", ticker: "MSFT", action: "fee", quantity: 0, price: 0, fees: 12.5, portfolio: "US Growth" }),
      // UK Income — VOD.L (closed)
      tx({ id: 8, date: "2025-05-10", ticker: "VOD.L", action: "buy", quantity: 500, price: 0.72, fees: 8, portfolio: "UK Income", currency: "GBP" }),
      tx({ id: 9, date: "2025-08-15", ticker: "VOD.L", action: "dividend", quantity: 500, price: 0.02, fees: 0, portfolio: "UK Income", currency: "GBP" }),
      tx({ id: 10, date: "2025-11-20", ticker: "VOD.L", action: "sell", quantity: 500, price: 0.85, fees: 8, portfolio: "UK Income", currency: "GBP" }),
      // UK Income — AAPL (separate from US Growth AAPL)
      tx({ id: 11, date: "2025-08-01", ticker: "AAPL", action: "buy", quantity: 15, price: 195, fees: 9.99, portfolio: "UK Income" }),
      // EU Diversified — SAP.DE
      tx({ id: 12, date: "2025-06-20", ticker: "SAP.DE", action: "buy", quantity: 40, price: 165.3, fees: 6.5, portfolio: "EU Diversified", currency: "EUR" }),
      tx({ id: 13, date: "2026-02-01", ticker: "SAP.DE", action: "dividend", quantity: 40, price: 2.2, fees: 0, portfolio: "EU Diversified", currency: "EUR" }),
    ];

    const marketData: Record<string, MarketDataInput> = {
      AAPL: { symbol: "AAPL", value: 215.3 },
      MSFT: { symbol: "MSFT", value: 365.8 },
      "VOD.L": { symbol: "VOD.L", value: 0.88 },
      "SAP.DE": { symbol: "SAP.DE", value: 178.5 },
    };

    const positions = computePositions(transactions, marketData);
    expect(positions).toHaveLength(5);

    // Verify portfolio isolation: AAPL appears in both US Growth and UK Income
    const aaplUs = positions.find((p) => p.ticker === "AAPL" && p.portfolio === "US Growth")!;
    const aaplUk = positions.find((p) => p.ticker === "AAPL" && p.portfolio === "UK Income")!;
    expect(aaplUs.sharesHeld).toBe(60);
    expect(aaplUk.sharesHeld).toBe(15);
    expect(aaplUk.costBasis).toBeCloseTo(2934.99, 2);
    expect(aaplUk.avgEntryPrice).toBeCloseTo(195.666, 2);

    // Verify closed position
    const vodl = positions.find((p) => p.ticker === "VOD.L")!;
    expect(vodl.isClosed).toBe(true);
    expect(vodl.totalPnl).toBeCloseTo(59, 2);

    // Verify SAP.DE
    const sap = positions.find((p) => p.ticker === "SAP.DE")!;
    expect(sap.costBasis).toBeCloseTo(6618.5, 2);
    expect(sap.totalDividends).toBeCloseTo(88, 2);

    // No position should have invalid state
    expect(positions.every((p) => !p.hasInvalidState)).toBe(true);
  });
});

describe("computeAggregates", () => {
  it("computes totals and weights across positions", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, action: "buy", quantity: 50, price: 100, fees: 0, ticker: "A", portfolio: "P1" }),
      tx({ id: 2, action: "buy", quantity: 100, price: 50, fees: 0, ticker: "B", portfolio: "P1" }),
    ];

    const marketData: Record<string, MarketDataInput> = {
      A: { symbol: "A", value: 110 },
      B: { symbol: "B", value: 55 },
    };

    const positions = computePositions(transactions, marketData);
    const agg = computeAggregates(positions);

    // totalValue = 50*110 + 100*55 = 5500 + 5500 = 11000
    expect(agg.totalValue).toBeCloseTo(11000, 2);
    expect(agg.totalCostBasis).toBeCloseTo(10000, 2);
    expect(agg.totalPnl).toBeCloseTo(1000, 2);
    expect(agg.positions).toHaveLength(2);
    // equal weight = 50%
    expect(agg.positions[0].weight).toBeCloseTo(50, 1);
    expect(agg.positions[1].weight).toBeCloseTo(50, 1);
  });

  it("returns null totalValue/totalPnl when any position has no market data", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, action: "buy", quantity: 10, price: 100, fees: 0, ticker: "A", portfolio: "P1" }),
      tx({ id: 2, action: "buy", quantity: 20, price: 50, fees: 0, ticker: "B", portfolio: "P1" }),
    ];

    const marketData: Record<string, MarketDataInput> = {
      A: { symbol: "A", value: 110 },
      // B has no market data
    };

    const positions = computePositions(transactions, marketData);
    const agg = computeAggregates(positions);

    expect(agg.totalValue).toBeNull();
    expect(agg.totalPnl).toBeNull();
    // Weights null when totalValue is null
    expect(agg.positions.find((p) => p.ticker === "A")!.weight).toBeNull();
  });

  it("includes closed positions in totals with realized P&L", () => {
    const transactions: TransactionInput[] = [
      tx({ id: 1, date: "2025-01-01", action: "buy", quantity: 100, price: 10, fees: 0, ticker: "A" }),
      tx({ id: 2, date: "2025-06-01", action: "sell", quantity: 100, price: 15, fees: 0, ticker: "A" }),
      tx({ id: 3, date: "2025-01-01", action: "buy", quantity: 50, price: 20, fees: 0, ticker: "B" }),
    ];

    const marketData: Record<string, MarketDataInput> = {
      B: { symbol: "B", value: 25 },
    };

    const positions = computePositions(transactions, marketData);
    const agg = computeAggregates(positions);

    // A: closed, realized P&L = (0 + 0 + 1500) - 1000 = 500
    // B: open, marketValue = 1250, P&L = 1250 - 1000 = 250
    // totalValue = 0 + 1250 = 1250
    expect(agg.totalValue).toBeCloseTo(1250, 2);
    expect(agg.totalPnl).toBeCloseTo(750, 2);
    expect(agg.totalCashReturned).toBeCloseTo(1500, 2);
  });

  it("handles empty positions array", () => {
    const agg = computeAggregates([]);

    expect(agg.totalValue).toBe(0);
    expect(agg.totalCostBasis).toBe(0);
    expect(agg.totalPnl).toBe(0);
    expect(agg.totalCashReturned).toBe(0);
    expect(agg.positions).toHaveLength(0);
  });
});
