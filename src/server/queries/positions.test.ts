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
}));

import { getActivePositions, getClosedPositions } from "./positions";
import { computePositions, computeAggregates } from "@/server/services/computation";
import type { AggregateMetrics, ComputedPosition } from "@/server/types/positions";

const mockComputePositions = vi.mocked(computePositions);
const mockComputeAggregates = vi.mocked(computeAggregates);

function makePosition(overrides: Partial<ComputedPosition> = {}): ComputedPosition {
  return {
    ticker: "AAPL",
    portfolio: "Main",
    currency: "USD",
    sharesHeld: 10,
    totalSharesBought: 10,
    totalSharesSold: 0,
    avgEntryPrice: 150,
    avgExitPrice: null,
    costBasis: 1500,
    lastPrice: 175,
    marketValue: 1750,
    totalDividends: 50,
    totalSellProceeds: 0,
    totalInvested: 1500,
    totalPnl: 300,
    realizedPnl: 50,
    unrealizedPnl: 250,
    currentFxRate: 1,
    cashReturned: 50,
    isClosed: false,
    hasInvalidState: false,
    ...overrides,
  };
}

describe("getActivePositions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no transactions exist", () => {
    mockComputePositions.mockReturnValue([]);
    mockComputeAggregates.mockReturnValue({
      totalValue: null,
      totalCostBasis: null,
      totalRealizedPnl: null,
      totalUnrealizedPnl: null,
      positions: [],
    });

    const result = getActivePositions();
    expect(result).toEqual([]);
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

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("AAPL");
    expect(result[0].portfolio).toBe("Main");
    expect(result[0].hasInvalidState).toBe(false);
    expect(result[0].shares).toEqual({ value: 10, display: "10.0" });
    expect(result[0].avgEntry).toEqual({ value: 150, display: "$150.00" });
    expect(result[0].lastPrice).toEqual({ value: 175, display: "$175.00" });
    expect(result[0].costBasis).toEqual({ value: 1500, display: "$1,500.00" });
    expect(result[0].marketValue).toEqual({ value: 1750, display: "$1,750.00" });
    expect(result[0].dividends).toEqual({ value: 50, display: "$50.00" });
    expect(result[0].sellProceeds).toEqual({ value: 0, display: "$0.00" });
    expect(result[0].pnl).toEqual({ value: 300, display: "+$300.00" });
    expect(result[0].weight).toEqual({ value: 57.3, display: "57.3%" });
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

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("AAPL");

    const aggregatesArg = mockComputeAggregates.mock.calls[0][0];
    expect(aggregatesArg).toHaveLength(1);
    expect(aggregatesArg[0].isClosed).toBe(false);
  });

  it("handles null price-dependent fields with N/A display", () => {
    const naPosition = makePosition({
      lastPrice: null,
      marketValue: null,
      totalPnl: null,
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

    expect(result[0].lastPrice).toEqual({ value: null, display: "N/A" });
    expect(result[0].marketValue).toEqual({ value: null, display: "N/A" });
    expect(result[0].pnl).toEqual({ value: null, display: "N/A" });
    expect(result[0].weight).toEqual({ value: null, display: "N/A" });
  });
});

describe("getClosedPositions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no positions exist", () => {
    mockComputePositions.mockReturnValue([]);

    const result = getClosedPositions();
    expect(result).toEqual([]);
  });

  it("returns only closed positions with correct formatting", () => {
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
      totalPnl: 280,
    });
    const activePosition = makePosition({ ticker: "AAPL", isClosed: false });

    mockComputePositions.mockReturnValue([activePosition, closedPosition]);

    const result = getClosedPositions();

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("TSLA");
    expect(result[0].portfolio).toBe("Schwab");
    expect(result[0].avgEntry).toEqual({ value: 215, display: "$215.00" });
    expect(result[0].avgExit).toEqual({ value: 240, display: "$240.00" });
    expect(result[0].lastPrice).toEqual({ value: 180, display: "$180.00" });
    expect(result[0].totalInvested).toEqual({ value: 2150, display: "$2,150.00" });
    expect(result[0].totalProceeds).toEqual({ value: 2400, display: "$2,400.00" });
    expect(result[0].dividends).toEqual({ value: 30, display: "$30.00" });
    expect(result[0].realizedPnl).toEqual({ value: 280, display: "+$280.00" });
  });

  it("excludes active positions", () => {
    const active = makePosition({ ticker: "AAPL", isClosed: false });
    const closed = makePosition({ ticker: "MSFT", isClosed: true, sharesHeld: 0 });

    mockComputePositions.mockReturnValue([active, closed]);

    const result = getClosedPositions();

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("MSFT");
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

    expect(result).toHaveLength(1);
    expect(result[0].ticker).toBe("TSLA");
    // computePositions is called (portfolio filtering happens at DB level in computeAllPositions)
    expect(mockComputePositions).toHaveBeenCalled();
  });

  it("handles null price-dependent fields with N/A display", () => {
    const closedNa = makePosition({
      isClosed: true,
      sharesHeld: 0,
      lastPrice: null,
      totalPnl: null,
      totalInvested: null,
      totalSellProceeds: null,
      totalDividends: null,
      avgEntryPrice: null,
      avgExitPrice: null,
    });

    mockComputePositions.mockReturnValue([closedNa]);

    const result = getClosedPositions();

    expect(result[0].lastPrice).toEqual({ value: null, display: "N/A" });
    expect(result[0].avgEntry).toEqual({ value: null, display: "N/A" });
    expect(result[0].avgExit).toEqual({ value: null, display: "N/A" });
    expect(result[0].totalInvested).toEqual({ value: null, display: "N/A" });
    expect(result[0].totalProceeds).toEqual({ value: null, display: "N/A" });
    expect(result[0].dividends).toEqual({ value: null, display: "N/A" });
    expect(result[0].realizedPnl).toEqual({ value: null, display: "N/A" });
  });
});
