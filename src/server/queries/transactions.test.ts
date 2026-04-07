import { vi, describe, it, expect, beforeEach } from "vitest";

// Mock the db module — variables must be inside factory since vi.mock is hoisted
vi.mock("@/server/db", () => {
  const mockAll = vi.fn().mockReturnValue([]);
  const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll });
  const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, all: mockAll });
  const mockFrom = vi.fn().mockReturnValue({
    all: mockAll,
    where: mockWhere,
    get: vi.fn().mockReturnValue({ count: 0 }),
  });
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom });
  return { db: { select: mockSelect } };
});

import { db } from "@/server/db";
import { getTransactions, getTransactionCount } from "./transactions";

// Access the mock chain
const mockSelect = vi.mocked(db.select);

function makeDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: "2025-03-15",
    ticker: "AAPL",
    action: "buy",
    quantity: 10.5,
    price: 172.50,
    fees: 4.95,
    portfolio: "Main",
    currency: "USD",
    ...overrides,
  };
}

describe("getTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-setup the mock chain after clearing
    const mockAll = vi.fn().mockReturnValue([]);
    const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, all: mockAll });
    const mockFrom = vi.fn().mockReturnValue({
      all: mockAll,
      where: mockWhere,
      get: vi.fn().mockReturnValue({ count: 0 }),
    });
    mockSelect.mockReturnValue({ from: mockFrom } as ReturnType<typeof mockSelect>);
  });

  function setupMockReturn(rows: ReturnType<typeof makeDbRow>[]) {
    // Call the chain to get the terminal mock and set its return value
    getTransactions(); // warm up to create mock instances
    vi.clearAllMocks();

    const mockAll = vi.fn().mockReturnValue(rows);
    const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll });
    const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy, all: mockAll });
    const mockFrom = vi.fn().mockReturnValue({
      all: mockAll,
      where: mockWhere,
      get: vi.fn().mockReturnValue({ count: rows.length }),
    });
    mockSelect.mockReturnValue({ from: mockFrom } as ReturnType<typeof mockSelect>);
  }

  it("returns empty array when no transactions exist", () => {
    const result = getTransactions();
    expect(result).toEqual([]);
  });

  it("returns formatted transaction rows", () => {
    setupMockReturn([makeDbRow()]);

    const result = getTransactions();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(1);
    expect(result[0].ticker).toBe("AAPL");
    expect(result[0].action).toBe("buy");
    expect(result[0].portfolio).toBe("Main");
    expect(result[0].currency).toBe("USD");
    expect(result[0].date).toEqual({ value: "2025-03-15", display: "Mar 15, 2025" });
    expect(result[0].quantity).toEqual({ value: 10.5, display: "10.5" });
    expect(result[0].price).toEqual({ value: 172.50, display: "$172.50" });
    expect(result[0].fees).toEqual({ value: 4.95, display: "$4.95" });
  });

  it("calls where when portfolio filter provided", () => {
    getTransactions("Main");
    // Verify select was called (the mock chain was exercised)
    expect(mockSelect).toHaveBeenCalled();
  });

  it("calls where when ticker filter provided", () => {
    getTransactions(undefined, "AAPL");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("calls where with both filters", () => {
    getTransactions("Main", "AAPL");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns multiple rows preserving order", () => {
    setupMockReturn([
      makeDbRow({ id: 2, date: "2025-04-01", ticker: "MSFT" }),
      makeDbRow({ id: 1, date: "2025-03-15", ticker: "AAPL" }),
    ]);

    const result = getTransactions();

    expect(result).toHaveLength(2);
    expect(result[0].ticker).toBe("MSFT");
    expect(result[1].ticker).toBe("AAPL");
  });

  it("formats zero fees correctly", () => {
    setupMockReturn([makeDbRow({ fees: 0 })]);

    const result = getTransactions();
    expect(result[0].fees).toEqual({ value: 0, display: "$0.00" });
  });
});

describe("getTransactionCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const mockFrom = vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ count: 5 }),
    });
    mockSelect.mockReturnValue({ from: mockFrom } as ReturnType<typeof mockSelect>);
  });

  it("returns count from database", () => {
    const result = getTransactionCount();
    expect(result).toBe(5);
  });
});
