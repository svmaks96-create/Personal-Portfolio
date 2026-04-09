import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/db", () => {
  // Update chain: db.update().set().where().run()
  const mockUpdateRun = vi.fn();
  const mockWhere = vi.fn().mockReturnValue({ run: mockUpdateRun });
  const mockSet = vi.fn().mockReturnValue({ where: mockWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  // Select chain: db.select().from().where().get() AND db.select({}).from().all()
  const mockGet = vi.fn().mockReturnValue(null);
  const mockAll = vi.fn().mockReturnValue([]);
  const mockSelectWhere = vi.fn().mockReturnValue({ get: mockGet });
  const mockSelectFrom = vi.fn().mockReturnValue({ where: mockSelectWhere, all: mockAll });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  // Insert chain: db.insert().values().run()
  const mockInsertRun = vi.fn().mockReturnValue({ lastInsertRowid: 42 });
  const mockValues = vi.fn().mockReturnValue({ run: mockInsertRun });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  return {
    db: {
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
      _mocks: { mockGet, mockAll, mockUpdateRun, mockSet, mockWhere, mockInsertRun, mockValues },
    },
  };
});

import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { updateTransaction, addTransaction } from "./transactions";

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

function validAddData() {
  return {
    date: "2025-04-01",
    ticker: "MSFT",
    action: "buy",
    quantity: 5,
    grossAmount: 2000,
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

describe("addTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAll.mockReturnValue([]);
    mocks.mockInsertRun.mockReturnValue({ lastInsertRowid: 42 });
  });

  it("returns success with id for valid buy transaction", async () => {
    const result = await addTransaction(validAddData());
    expect(result).toEqual({ success: true, data: { id: 42 } });
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("inserts with Zod-transformed values (uppercase ticker/currency)", async () => {
    await addTransaction({ ...validAddData(), ticker: "msft", currency: "usd" });
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ ticker: "MSFT", currency: "USD" }),
    );
  });

  it("rejects missing required fields", async () => {
    const result = await addTransaction({
      ...validAddData(),
      ticker: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.ticker).toBeDefined();
    }
  });

  it("rejects invalid date format", async () => {
    const result = await addTransaction({ ...validAddData(), date: "not-a-date" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.date).toBeDefined();
    }
  });

  it("rejects negative quantity", async () => {
    const result = await addTransaction({ ...validAddData(), quantity: -5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.quantity).toBeDefined();
    }
  });

  it("rejects negative grossAmount on buy", async () => {
    const result = await addTransaction({ ...validAddData(), grossAmount: -100 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.grossAmount).toBeDefined();
    }
  });

  it("allows negative grossAmount on dividend (withholding tax)", async () => {
    const result = await addTransaction({
      ...validAddData(),
      action: "dividend",
      quantity: 0,
      grossAmount: -5.25,
    });
    expect(result).toEqual({ success: true, data: { id: 42 } });
  });

  it("rejects negative fees", async () => {
    const result = await addTransaction({ ...validAddData(), fees: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.fees).toBeDefined();
    }
  });

  it("rejects zero quantity on buy (cross-field refinement)", async () => {
    const result = await addTransaction({ ...validAddData(), quantity: 0 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.quantity).toBeDefined();
    }
  });

  it("rejects sell-more-than-held", async () => {
    // Existing: bought 10 AAPL in Main
    mocks.mockAll.mockReturnValue([
      { ticker: "AAPL", portfolio: "Main", action: "buy", quantity: 10 },
    ]);
    const result = await addTransaction({
      ...validAddData(),
      ticker: "AAPL",
      action: "sell",
      quantity: 15,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.quantity).toContain("Cannot sell more than held");
    }
  });

  it("allows sell within held quantity", async () => {
    mocks.mockAll.mockReturnValue([
      { ticker: "AAPL", portfolio: "Main", action: "buy", quantity: 10 },
    ]);
    const result = await addTransaction({
      ...validAddData(),
      ticker: "AAPL",
      action: "sell",
      quantity: 5,
      grossAmount: 800,
    });
    expect(result).toEqual({ success: true, data: { id: 42 } });
  });

  it("detects duplicate transaction", async () => {
    mocks.mockAll.mockReturnValue([
      {
        id: 1,
        date: "2025-04-01",
        ticker: "MSFT",
        action: "buy",
        quantity: 5,
        grossAmount: 2000,
        portfolio: "Main",
      },
    ]);
    const result = await addTransaction(validAddData());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("Duplicate transaction detected");
    }
  });

  it("allows override of duplicate detection", async () => {
    mocks.mockAll.mockReturnValue([
      {
        id: 1,
        date: "2025-04-01",
        ticker: "MSFT",
        action: "buy",
        quantity: 5,
        grossAmount: 2000,
        portfolio: "Main",
      },
    ]);
    const result = await addTransaction(validAddData(), true);
    expect(result).toEqual({ success: true, data: { id: 42 } });
  });

  it("does not call revalidatePath on validation failure", async () => {
    await addTransaction({ ...validAddData(), ticker: "" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not insert on validation failure", async () => {
    await addTransaction({ ...validAddData(), ticker: "" });
    expect(mocks.mockValues).not.toHaveBeenCalled();
  });

  it("does not insert on sell-more-than-held", async () => {
    mocks.mockAll.mockReturnValue([
      { ticker: "AAPL", portfolio: "Main", action: "buy", quantity: 5 },
    ]);
    await addTransaction({
      ...validAddData(),
      ticker: "AAPL",
      action: "sell",
      quantity: 10,
    });
    expect(mocks.mockValues).not.toHaveBeenCalled();
  });

  it("does not insert on duplicate detection", async () => {
    mocks.mockAll.mockReturnValue([
      {
        id: 1,
        date: "2025-04-01",
        ticker: "MSFT",
        action: "buy",
        quantity: 5,
        grossAmount: 2000,
        portfolio: "Main",
      },
    ]);
    await addTransaction(validAddData());
    expect(mocks.mockValues).not.toHaveBeenCalled();
  });

  it("defaults fees to 0 when provided as 0", async () => {
    await addTransaction({ ...validAddData(), fees: 0 });
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ fees: 0 }),
    );
  });

  it("rejects invalid currency length", async () => {
    const result = await addTransaction({ ...validAddData(), currency: "US" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.currency).toBeDefined();
    }
  });
});
