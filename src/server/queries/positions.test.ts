import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the db module — same pattern as dashboard.test.ts
vi.mock("@/server/db", () => {
  const mockAll = vi.fn().mockReturnValue([]);
  const mockWhere = vi.fn().mockReturnValue({ all: mockAll, orderBy: vi.fn().mockReturnValue({ all: mockAll }) });
  const mockFrom = vi.fn().mockReturnValue({ all: mockAll, where: mockWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return { db: { select: mockSelect } };
});

// Mock computation service
vi.mock("@/server/services/computation", () => ({
  computePositions: vi.fn(),
  computeAggregates: vi.fn(),
  mergePositionsByTicker: vi.fn((positions: unknown[]) => positions),
  computePortfolioIRR: vi.fn(),
}));

import { getActivePositions, getClosedPositions } from "./positions";
import { computePositions, computeAggregates, computePortfolioIRR } from "@/server/services/computation";
import type { AggregateMetrics, ComputedPosition } from "@/server/types/positions";

const mockComputePositions = vi.mocked(computePositions);
const mockComputeAggregates = vi.mocked(computeAggregates);
const mockComputePortfolioIRR = vi.mocked(computePortfolioIRR);

function makePosition(overrides: Partial<ComputedPosition> = {}): ComputedPosition {
  return {
    ticker: "AAPL",
    portfolio: "Main",
    instrument: "stock",
    markDate: null,
    currency: "USD",
    sharesHeld: 10,
    totalSharesBought: 10,
    totalSharesSold: 0,
    avgEntryPrice: 150,
    avgExitPrice: null,
    costBasis: 1500,
    lastPrice: 175,
    lastPriceDate: "2026-04-16",
    marketValue: 1750,
    totalDividends: 50,
    totalSellProceeds: 0,
    totalInvested: 1500,
    totalPnl: 300,
    realizedPnl: 50,
    unrealizedPnl: 250,
    currentFxRate: 1,
    cashReturned: 50,
    irr: null,
    isClosed: false,
    hasInvalidState: false,
    ...overrides,
  };
}

describe("getActivePositions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows + null totals when no transactions exist", () => {
    mockComputePositions.mockReturnValue([]);
    mockComputeAggregates.mockReturnValue({
      totalValue: null,
      totalCostBasis: null,
      totalRealizedPnl: null,
      totalUnrealizedPnl: null,
      positions: [],
    });

    const result = getActivePositions();
    expect(result.rows).toEqual([]);
    expect(result.totals).toBeNull();
  });

  it("returns formatted active position rows", () => {
    const activePosition = makePosition();
    const aggregates: AggregateMetrics = {
      totalValue: 1750,
      totalCostBasis: 1500,
      totalRealizedPnl: 50,
      totalUnrealizedPnl: 250,
      positions: [{ ...activePosition, weight: 57.3 }],
    };

    mockComputePositions.mockReturnValue([activePosition]);
    mockComputeAggregates.mockReturnValue(aggregates);

    const result = getActivePositions();

    expect(result.rows).toHaveLength(1);
    const [row] = result.rows;
    expect(row.ticker).toBe("AAPL");
    expect(row.companyName).toBeNull();
    expect(row.hasInvalidState).toBe(false);
    expect(row.shares).toEqual({ value: 10, display: "10.0" });
    expect(row.avgEntry).toEqual({ value: 150, display: "$150.00" });
    expect(row.lastPrice).toEqual({ value: 175, display: "$175.00" });
    expect(row.costBasis).toEqual({ value: 1500, display: "$1,500" });
    expect(row.marketValue).toEqual({ value: 1750, display: "$1,750" });
    expect(row.dividends).toEqual({ value: 50, display: "$50" });
    expect(row.sellProceeds).toEqual({ value: 0, display: "$0" });
    expect(row.pnl).toEqual({ value: 300, display: "+$300" });
    expect(row.realizedPnl).toEqual({ value: 50, display: "+$50" });
    expect(row.unrealizedPnl).toEqual({ value: 250, display: "+$250" });
    expect(row.weight).toEqual({ value: 57.3, display: "57.3%" });
  });

  it("excludes closed positions before computing aggregates", () => {
    const active = makePosition({ ticker: "AAPL", isClosed: false });
    const closed = makePosition({ ticker: "MSFT", isClosed: true });

    mockComputePositions.mockReturnValue([active, closed]);
    mockComputeAggregates.mockReturnValue({
      totalValue: 1750,
      totalCostBasis: 1500,
      totalRealizedPnl: 50,
      totalUnrealizedPnl: 250,
      positions: [{ ...active, weight: 100 }],
    });

    const result = getActivePositions();

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ticker).toBe("AAPL");

    const aggregatesArg = mockComputeAggregates.mock.calls[0][0];
    expect(aggregatesArg).toHaveLength(1);
    expect(aggregatesArg[0].isClosed).toBe(false);
  });

  it("handles null price-dependent fields with N/A display", () => {
    const naPosition = makePosition({
      lastPrice: null,
      marketValue: null,
      totalPnl: null,
      realizedPnl: null,
      unrealizedPnl: null,
    });

    mockComputePositions.mockReturnValue([naPosition]);
    mockComputeAggregates.mockReturnValue({
      totalValue: null,
      totalCostBasis: 1500,
      totalRealizedPnl: null,
      totalUnrealizedPnl: null,
      positions: [{ ...naPosition, weight: null }],
    });

    const result = getActivePositions();

    expect(result.rows[0].lastPrice).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].marketValue).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].pnl).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].realizedPnl).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].unrealizedPnl).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].weight).toEqual({ value: null, display: "N/A" });
  });

  it("totals sum each additive field across all active rows", () => {
    const a = makePosition({ ticker: "AAPL", costBasis: 1000, marketValue: 1500, totalDividends: 20, totalSellProceeds: 100, totalPnl: 600, realizedPnl: 100, unrealizedPnl: 500 });
    const b = makePosition({ ticker: "MSFT", costBasis: 2000, marketValue: 2200, totalDividends: 30, totalSellProceeds: 0, totalPnl: 200, realizedPnl: 30, unrealizedPnl: 170 });

    mockComputePositions.mockReturnValue([a, b]);
    mockComputeAggregates.mockReturnValue({
      totalValue: 3700,
      totalCostBasis: 3000,
      totalRealizedPnl: 130,
      totalUnrealizedPnl: 670,
      positions: [
        { ...a, weight: 40 },
        { ...b, weight: 60 },
      ],
    });
    mockComputePortfolioIRR.mockReturnValue(12.5);

    const { totals } = getActivePositions();
    expect(totals).not.toBeNull();
    expect(totals!.costBasis).toEqual({ value: 3000, display: "$3,000" });
    expect(totals!.marketValue).toEqual({ value: 3700, display: "$3,700" });
    expect(totals!.dividends).toEqual({ value: 50, display: "$50" });
    expect(totals!.sellProceeds).toEqual({ value: 100, display: "$100" });
    expect(totals!.pnl).toEqual({ value: 800, display: "+$800" });
    expect(totals!.realizedPnl).toEqual({ value: 130, display: "+$130" });
    expect(totals!.unrealizedPnl).toEqual({ value: 670, display: "+$670" });
    // Identity: realized + unrealized = pnl. If the page mistakes one for
    // the other, this assertion stays green but the KPI labels do not.
    expect(totals!.realizedPnl.value! + totals!.unrealizedPnl.value!).toBe(totals!.pnl.value);
    expect(totals!.irr).toEqual({ value: 12.5, display: "+13%" });
    // Weight total is the actual sum — deviation from 100% is a bug signal.
    expect(totals!.weight).toEqual({ value: 100, display: "100.0%" });
  });

  it("totals IRR is computed via computePortfolioIRR over active tickers only", () => {
    const active = makePosition({ ticker: "AAPL", isClosed: false });
    const closed = makePosition({ ticker: "MSFT", isClosed: true, sharesHeld: 0 });

    mockComputePositions.mockReturnValue([active, closed]);
    mockComputeAggregates.mockReturnValue({
      totalValue: 1750,
      totalCostBasis: 1500,
      totalRealizedPnl: 50,
      totalUnrealizedPnl: 250,
      positions: [{ ...active, weight: 100 }],
    });
    mockComputePortfolioIRR.mockReturnValue(8.2);

    const { totals } = getActivePositions();

    expect(totals!.irr).toEqual({ value: 8.2, display: "+8%" });
    // Positions passed to computePortfolioIRR should be active-only so no
    // terminal market value is appended for the closed ticker.
    const positionsArg = mockComputePortfolioIRR.mock.calls[0][1];
    expect(positionsArg).toHaveLength(1);
    expect(positionsArg[0].ticker).toBe("AAPL");
  });

  it("totals IRR surfaces N/A when solver cannot converge", () => {
    const a = makePosition({ ticker: "AAPL" });
    mockComputePositions.mockReturnValue([a]);
    mockComputeAggregates.mockReturnValue({
      totalValue: 1750,
      totalCostBasis: 1500,
      totalRealizedPnl: 50,
      totalUnrealizedPnl: 250,
      positions: [{ ...a, weight: 100 }],
    });
    mockComputePortfolioIRR.mockReturnValue(null);

    const { totals } = getActivePositions();

    expect(totals!.irr).toEqual({ value: null, display: "N/A" });
  });

  it("totals null-propagate: one null row field forces total null / N/A", () => {
    const a = makePosition({ ticker: "AAPL", costBasis: 1000, marketValue: 1500, totalDividends: 20 });
    const bNa = makePosition({
      ticker: "MSFT",
      costBasis: null,
      marketValue: null,
      totalPnl: null,
      realizedPnl: null,
      unrealizedPnl: null,
    });

    mockComputePositions.mockReturnValue([a, bNa]);
    mockComputeAggregates.mockReturnValue({
      totalValue: null,
      totalCostBasis: null,
      totalRealizedPnl: null,
      totalUnrealizedPnl: null,
      positions: [
        { ...a, weight: 100 },
        { ...bNa, weight: null },
      ],
    });

    const { totals } = getActivePositions();
    expect(totals!.costBasis).toEqual({ value: null, display: "N/A" });
    expect(totals!.marketValue).toEqual({ value: null, display: "N/A" });
    expect(totals!.pnl).toEqual({ value: null, display: "N/A" });
    expect(totals!.realizedPnl).toEqual({ value: null, display: "N/A" });
    expect(totals!.unrealizedPnl).toEqual({ value: null, display: "N/A" });
    expect(totals!.weight).toEqual({ value: null, display: "N/A" });
    // Dividends and sell proceeds are both non-null on every row → still sum.
    expect(totals!.dividends.value).toBe(70); // 20 + 50 (default from makePosition)
  });
});

describe("getClosedPositions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty rows + null totals when no positions exist", () => {
    mockComputePositions.mockReturnValue([]);

    const result = getClosedPositions();
    expect(result.rows).toEqual([]);
    expect(result.totals).toBeNull();
  });

  it("returns only closed positions with correct formatting", () => {
    // Diverging totalPnl vs realizedPnl pins the row mapping to p.realizedPnl —
    // they would always agree for a real closed position, but using a
    // divergent fixture here proves the query reads the right field name.
    const closedPosition = makePosition({
      ticker: "TSLA",
      portfolio: "Schwab",
      isClosed: true,
      sharesHeld: 0,
      avgEntryPrice: 215,
      avgExitPrice: 240,
      lastPrice: 180,
      totalInvested: 2150,
      totalSellProceeds: 2400,
      totalDividends: 30,
      totalPnl: 999,
      realizedPnl: 280,
      unrealizedPnl: 0,
    });
    const activePosition = makePosition({ ticker: "AAPL", isClosed: false });

    mockComputePositions.mockReturnValue([activePosition, closedPosition]);

    const result = getClosedPositions();

    expect(result.rows).toHaveLength(1);
    const [row] = result.rows;
    expect(row.ticker).toBe("TSLA");
    expect(row.companyName).toBeNull();
    expect(row.avgEntry).toEqual({ value: 215, display: "$215.00" });
    expect(row.avgExit).toEqual({ value: 240, display: "$240.00" });
    expect(row.lastPrice).toEqual({ value: 180, display: "$180.00" });
    expect(row.totalInvested).toEqual({ value: 2150, display: "$2,150" });
    expect(row.totalProceeds).toEqual({ value: 2400, display: "$2,400" });
    expect(row.dividends).toEqual({ value: 30, display: "$30" });
    expect(row.realizedPnl).toEqual({ value: 280, display: "+$280" });
  });

  it("excludes active positions", () => {
    const active = makePosition({ ticker: "AAPL", isClosed: false });
    const closed = makePosition({ ticker: "MSFT", isClosed: true, sharesHeld: 0 });

    mockComputePositions.mockReturnValue([active, closed]);

    const result = getClosedPositions();

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ticker).toBe("MSFT");
  });

  it("does not call computeAggregates", () => {
    mockComputePositions.mockReturnValue([]);

    getClosedPositions();

    expect(mockComputeAggregates).not.toHaveBeenCalled();
  });

  it("passes portfolio filter to computeAllPositions", () => {
    const closed = makePosition({ ticker: "TSLA", portfolio: "Schwab", isClosed: true, sharesHeld: 0 });
    mockComputePositions.mockReturnValue([closed]);

    const result = getClosedPositions("Schwab");

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].ticker).toBe("TSLA");
    // computePositions is called (portfolio filtering happens at DB level in computeAllPositions)
    expect(mockComputePositions).toHaveBeenCalled();
  });

  it("handles null price-dependent fields with N/A display", () => {
    const closedNa = makePosition({
      isClosed: true,
      sharesHeld: 0,
      lastPrice: null,
      totalPnl: null,
      realizedPnl: null,
      unrealizedPnl: null,
      totalInvested: null,
      totalSellProceeds: null,
      totalDividends: null,
      avgEntryPrice: null,
      avgExitPrice: null,
    });

    mockComputePositions.mockReturnValue([closedNa]);

    const result = getClosedPositions();

    expect(result.rows[0].lastPrice).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].avgEntry).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].avgExit).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].totalInvested).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].totalProceeds).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].dividends).toEqual({ value: null, display: "N/A" });
    expect(result.rows[0].realizedPnl).toEqual({ value: null, display: "N/A" });
  });

  it("totals sum each additive field across all closed rows", () => {
    const a = makePosition({ ticker: "TSLA", isClosed: true, sharesHeld: 0, totalInvested: 2000, totalSellProceeds: 2500, totalDividends: 30, totalPnl: 530, realizedPnl: 530, unrealizedPnl: 0 });
    const b = makePosition({ ticker: "AMD", isClosed: true, sharesHeld: 0, totalInvested: 1000, totalSellProceeds: 900, totalDividends: 10, totalPnl: -90, realizedPnl: -90, unrealizedPnl: 0 });

    mockComputePositions.mockReturnValue([a, b]);
    mockComputePortfolioIRR.mockReturnValue(15.4);

    const { totals } = getClosedPositions();
    expect(totals).not.toBeNull();
    expect(totals!.totalInvested).toEqual({ value: 3000, display: "$3,000" });
    expect(totals!.totalProceeds).toEqual({ value: 3400, display: "$3,400" });
    expect(totals!.dividends).toEqual({ value: 40, display: "$40" });
    expect(totals!.realizedPnl).toEqual({ value: 440, display: "+$440" });
    expect(totals!.irr).toEqual({ value: 15.4, display: "+15%" });
  });

  it("totals IRR is computed over closed tickers only (no terminal value appended)", () => {
    const active = makePosition({ ticker: "AAPL", isClosed: false });
    const closed = makePosition({ ticker: "TSLA", isClosed: true, sharesHeld: 0 });

    mockComputePositions.mockReturnValue([active, closed]);
    mockComputePortfolioIRR.mockReturnValue(-5.1);

    const { totals } = getClosedPositions();

    expect(totals!.irr).toEqual({ value: -5.1, display: "-5%" });
    // Only the closed position should be passed — the active ticker's
    // transactions must NOT be included in the closed-totals XIRR.
    const positionsArg = mockComputePortfolioIRR.mock.calls[0][1];
    expect(positionsArg).toHaveLength(1);
    expect(positionsArg[0].ticker).toBe("TSLA");
    expect(positionsArg[0].isClosed).toBe(true);
  });
});
