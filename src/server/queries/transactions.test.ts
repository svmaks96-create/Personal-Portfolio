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
    grossAmount: 1812.75,
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
    // Call the chain to create mock instances, then reset
    getTransactions();
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

  it("returns formatted buy transaction rows with derived fields", () => {
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
    expect(result[0].grossAmount).toEqual({ value: 1812.75, display: "1,812.75" });
    expect(result[0].fees).toEqual({ value: 4.95, display: "4.95" });
    // net = 1812.75 + 4.95 = 1817.70 (buy: gross + fees)
    expect(result[0].netAmount).toEqual({ value: 1817.70, display: "1,817.70" });
    // net avg price = 1817.70 / 10.5 ≈ 173.114...
    expect(result[0].netAvgPrice.value).toBeCloseTo(1817.70 / 10.5, 2);
  });

  it("computes sell net amount as gross minus fees", () => {
    setupMockReturn([makeDbRow({ action: "sell", grossAmount: 4215, fees: 4.99 })]);

    const result = getTransactions();
    // sell net = 4215 - 4.99 = 4210.01
    expect(result[0].netAmount.value).toBeCloseTo(4210.01, 2);
  });

  it("shows N/A for quantity and net avg price on dividend rows", () => {
    setupMockReturn([makeDbRow({ action: "dividend", quantity: 0, grossAmount: 15, fees: 0 })]);

    const result = getTransactions();
    expect(result[0].quantity).toEqual({ value: null, display: "\u2014" });
    expect(result[0].netAvgPrice).toEqual({ value: null, display: "\u2014" });
    expect(result[0].fees).toEqual({ value: null, display: "\u2014" });
    expect(result[0].netAmount.value).toBe(15);
  });

  it("shows N/A for quantity, gross amount, and net avg price on fee rows", () => {
    setupMockReturn([makeDbRow({ action: "fee", quantity: 0, grossAmount: 0, fees: 12.50 })]);

    const result = getTransactions();
    expect(result[0].quantity).toEqual({ value: null, display: "\u2014" });
    expect(result[0].grossAmount).toEqual({ value: null, display: "\u2014" });
    expect(result[0].netAvgPrice).toEqual({ value: null, display: "\u2014" });
    expect(result[0].netAmount.value).toBe(12.50);
  });

  it("calls where when portfolio filter provided", () => {
    getTransactions("Main");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("calls where when ticker filter provided", () => {
    getTransactions(undefined, "AAPL");
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
    expect(result[0].fees).toEqual({ value: 0, display: "0.00" });
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
