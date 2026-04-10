import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the db module
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
  computePortfolioIRR: vi.fn().mockReturnValue(null),
  mergePositionsByTicker: vi.fn((positions: unknown[]) => positions),
}));

import { getDashboardMetrics } from "./dashboard";
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
    currentFxRate: 1,
    cashReturned: 50,
    irr: null,
    isClosed: false,
    hasInvalidState: false,
    ...overrides,
  };
}

describe("getDashboardMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregate metrics from computation engine", () => {
    const activePosition = makePosition();
    const expectedAggregates: AggregateMetrics = {
      totalValue: 1750,
      totalCostBasis: 1500,
      totalPnl: 300,
      totalCashReturned: 50,
      irr: null,
      positions: [{ ...activePosition, weight: 100 }],
    };

    mockComputePositions.mockReturnValue([activePosition]);
    mockComputeAggregates.mockReturnValue(expectedAggregates);

    const result = getDashboardMetrics();

    expect(computePositions).toHaveBeenCalledOnce();
    expect(computeAggregates).toHaveBeenCalledOnce();
    expect(result).toEqual(expectedAggregates);
  });

  it("filters out closed positions before computing aggregates", () => {
    const active = makePosition({ isClosed: false });
    const closed = makePosition({ ticker: "MSFT", isClosed: true, marketValue: 0 });
    const expectedAggregates: AggregateMetrics = {
      totalValue: 1750,
      totalCostBasis: 1500,
      totalPnl: 300,
      totalCashReturned: 50,
      irr: null,
      positions: [{ ...active, weight: 100 }],
    };

    mockComputePositions.mockReturnValue([active, closed]);
    mockComputeAggregates.mockReturnValue(expectedAggregates);

    getDashboardMetrics();

    // computeAggregates should only receive active positions
    const aggregatesArg = mockComputeAggregates.mock.calls[0][0];
    expect(aggregatesArg).toHaveLength(1);
    expect(aggregatesArg[0].ticker).toBe("AAPL");
    expect(aggregatesArg.every((p: ComputedPosition) => !p.isClosed)).toBe(true);
  });

  it("returns null aggregates when no positions exist", () => {
    const emptyAggregates: AggregateMetrics = {
      totalValue: null,
      totalCostBasis: null,
      totalPnl: null,
      totalCashReturned: null,
      irr: null,
      positions: [],
    };

    mockComputePositions.mockReturnValue([]);
    mockComputeAggregates.mockReturnValue(emptyAggregates);

    const result = getDashboardMetrics();

    expect(result.totalValue).toBeNull();
    expect(result.positions).toHaveLength(0);
  });

  it("handles N/A positions with null price-dependent fields", () => {
    const naPosition = makePosition({
      marketValue: null,
      totalPnl: null,
      lastPrice: null,
    });
    const expectedAggregates: AggregateMetrics = {
      totalValue: null,
      totalCostBasis: 1500,
      totalPnl: null,
      totalCashReturned: 50,
      irr: null,
      positions: [{ ...naPosition, weight: null }],
    };

    mockComputePositions.mockReturnValue([naPosition]);
    mockComputeAggregates.mockReturnValue(expectedAggregates);

    const result = getDashboardMetrics();

    expect(result.totalValue).toBeNull();
    expect(result.totalPnl).toBeNull();
    expect(result.totalCostBasis).toBe(1500);
  });
});
