import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/db", () => {
  const mockRun = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ run: mockRun });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockGet = vi.fn().mockReturnValue(null);
  const mockSelectWhere = vi.fn().mockReturnValue({ get: mockGet });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  return {
    db: {
      select: mockSelect,
      update: mockUpdate,
      _mocks: { mockGet, mockRun, mockSet, mockWhere },
    },
  };
});

import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { updateTransaction } from "./transactions";

const mocks = (db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> })._mocks;

function existingRow() {
  return {
    id: 1,
    date: "2025-03-15",
    ticker: "AAPL",
    action: "buy" as const,
    quantity: 10,
    grossAmount: 1500,
    fees: 4.95,
    portfolio: "Main",
    currency: "USD",
  };
}

describe("updateTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGet.mockReturnValue(null);
  });

  it("returns error when transaction not found", async () => {
    mocks.mockGet.mockReturnValue(null);
    const result = await updateTransaction(999, "ticker", "MSFT");
    expect(result).toEqual({ success: false, error: "Transaction not found" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns success for valid update", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    const result = await updateTransaction(1, "ticker", "MSFT");
    expect(result).toEqual({ success: true, data: undefined });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("returns fieldErrors for validation failure", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    const result = await updateTransaction(1, "quantity", -5);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors).toBeDefined();
      expect(result.fieldErrors!.quantity).toBeDefined();
    }
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects negative grossAmount on buy (FR29)", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    const result = await updateTransaction(1, "grossAmount", -100);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.grossAmount).toBeDefined();
    }
  });

  it("allows negative grossAmount on dividend (FR29)", async () => {
    mocks.mockGet.mockReturnValue({ ...existingRow(), action: "dividend", quantity: 0 });
    const result = await updateTransaction(1, "grossAmount", -5.25);
    expect(result).toEqual({ success: true, data: undefined });
  });

  it("rejects empty ticker", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    const result = await updateTransaction(1, "ticker", "");
    expect(result.success).toBe(false);
  });

  it("rejects invalid date format", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    const result = await updateTransaction(1, "date", "not-a-date");
    expect(result.success).toBe(false);
  });

  it("uppercases ticker via Zod transform", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    await updateTransaction(1, "ticker", "msft");
    expect(mocks.mockSet).toHaveBeenCalledWith({ ticker: "MSFT" });
  });

  it("uppercases currency via Zod transform", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    await updateTransaction(1, "currency", "gbp");
    expect(mocks.mockSet).toHaveBeenCalledWith({ currency: "GBP" });
  });

  it("does not call revalidatePath on validation failure", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    await updateTransaction(1, "fees", -10);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects invalid field name", async () => {
    const result = await updateTransaction(1, "id" as "ticker", "999");
    expect(result).toEqual({ success: false, error: "Invalid field" });
    expect(mocks.mockGet).not.toHaveBeenCalled();
  });

  it("rejects zero quantity on buy via cross-field refinement", async () => {
    mocks.mockGet.mockReturnValue(existingRow());
    const result = await updateTransaction(1, "quantity", 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.quantity).toBeDefined();
    }
  });

  it("shows relevant error when cross-field refinement fails on different field", async () => {
    mocks.mockGet.mockReturnValue({ ...existingRow(), grossAmount: -10 });
    const result = await updateTransaction(1, "action", "buy");
    expect(result.success).toBe(false);
    if (!result.success) {
      // Should show the grossAmount error, not generic "Validation failed"
      expect(result.error).not.toBe("Validation failed");
    }
  });
});
