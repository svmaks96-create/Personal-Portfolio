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

describe("getDashboardMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns aggregate metrics from computation engine", () => {
    const activePosition = makePosition();
    const expectedAggregates: AggregateMetrics = {
      totalValue: 1750,
      totalCostBasis: 1500,
      totalRealizedPnl: 50,
      totalUnrealizedPnl: 250,
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

  it("includes closed positions when computing aggregates", () => {
    // Regression: filtering out closed positions before computeAggregates
    // dropped realized P&L from fully-closed positions, breaking the
    // invariant Σ(per-portfolio totals) == All total whenever a ticker was
    // closed in one portfolio but still active in another.
    const active = makePosition({ isClosed: false });
    const closed = makePosition({
      ticker: "MSFT",
      isClosed: true,
      marketValue: 0,
      costBasis: 0,
      unrealizedPnl: 0,
      realizedPnl: 200,
    });
    const expectedAggregates: AggregateMetrics = {
      totalValue: 1750,
      totalCostBasis: 1500,
      totalRealizedPnl: 250,
      totalUnrealizedPnl: 250,
      irr: null,
      positions: [
        { ...active, weight: 100 },
        { ...closed, weight: 0 },
      ],
    };

    mockComputePositions.mockReturnValue([active, closed]);
    mockComputeAggregates.mockReturnValue(expectedAggregates);

    getDashboardMetrics();

    const aggregatesArg = mockComputeAggregates.mock.calls[0][0];
    expect(aggregatesArg).toHaveLength(2);
    expect(aggregatesArg.some((p: ComputedPosition) => p.isClosed)).toBe(true);
  });

  it("returns null aggregates when no positions exist", () => {
    const emptyAggregates: AggregateMetrics = {
      totalValue: null,
      totalCostBasis: null,
      totalRealizedPnl: null,
      totalUnrealizedPnl: null,
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
      realizedPnl: null,
      unrealizedPnl: null,
      lastPrice: null,
    });
    const expectedAggregates: AggregateMetrics = {
      totalValue: null,
      totalCostBasis: 1500,
      totalRealizedPnl: null,
      totalUnrealizedPnl: null,
      irr: null,
      positions: [{ ...naPosition, weight: null }],
    };

    mockComputePositions.mockReturnValue([naPosition]);
    mockComputeAggregates.mockReturnValue(expectedAggregates);

    const result = getDashboardMetrics();

    expect(result.totalValue).toBeNull();
    expect(result.totalRealizedPnl).toBeNull();
    expect(result.totalCostBasis).toBe(1500);
  });
});
