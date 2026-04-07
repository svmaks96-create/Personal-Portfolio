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
}));

import { getActivePositions } from "./positions";
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
    avgEntryPrice: 150,
    costBasis: 1500,
    lastPrice: 175,
    marketValue: 1750,
    totalDividends: 50,
    totalSellProceeds: 0,
    totalInvested: 1500,
    totalPnl: 300,
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
      totalPnl: null,
      totalCashReturned: null,
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
      totalPnl: 300,
      totalCashReturned: 50,
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
      totalPnl: 300,
      totalCashReturned: 50,
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
      totalPnl: null,
      totalCashReturned: 50,
      positions: [{ ...naPosition, weight: null }],
    });

    const result = getActivePositions();

    expect(result[0].lastPrice).toEqual({ value: null, display: "N/A" });
    expect(result[0].marketValue).toEqual({ value: null, display: "N/A" });
    expect(result[0].pnl).toEqual({ value: null, display: "N/A" });
    expect(result[0].weight).toEqual({ value: null, display: "N/A" });
  });
});
