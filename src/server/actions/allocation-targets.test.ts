import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/db", () => {
  const mockUpdateRun = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({ run: mockUpdateRun });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockGet = vi.fn().mockReturnValue(null);
  const mockAll = vi.fn().mockReturnValue([]);
  const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll });
  const mockSelectWhere = vi.fn().mockReturnValue({ get: mockGet });
  const mockSelectFrom = vi.fn().mockReturnValue({
    where: mockSelectWhere,
    all: mockAll,
    orderBy: mockOrderBy,
  });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  const mockInsertRun = vi.fn().mockReturnValue({ lastInsertRowid: 42 });
  const mockValues = vi.fn().mockReturnValue({ run: mockInsertRun });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  const mockDeleteRun = vi.fn().mockReturnValue({ changes: 1 });
  const mockDeleteWhere = vi.fn().mockReturnValue({ run: mockDeleteRun });
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  return {
    db: {
      select: mockSelect,
      update: mockUpdate,
      insert: mockInsert,
      delete: mockDelete,
      _mocks: {
        mockGet,
        mockAll,
        mockUpdateRun,
        mockSet,
        mockInsertRun,
        mockValues,
        mockDeleteRun,
      },
    },
  };
});

import { db } from "@/server/db";
import {
  createAllocationTarget,
  updateAllocationTarget,
  deleteAllocationTarget,
} from "./allocation-targets";

const mocks = (db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> })._mocks;

function existingTickerRow() {
  return {
    id: 1,
    kind: "ticker" as const,
    name: "AAPL",
    targetWeight: 40,
    cashAmountUsd: null,
    sortOrder: 1,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

function existingCashRow() {
  return {
    id: 2,
    kind: "cash" as const,
    name: "Schwab Cash",
    targetWeight: 5,
    cashAmountUsd: 5000,
    sortOrder: 2,
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-04-01T00:00:00.000Z",
  };
}

describe("createAllocationTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAll.mockReturnValue([]);
  });

  it("creates a valid ticker row", async () => {
    const result = await createAllocationTarget({
      kind: "ticker",
      name: "msft",
      targetWeight: 30,
      cashAmountUsd: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe(42);
    }
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "ticker", name: "MSFT", targetWeight: 30, cashAmountUsd: null }),
    );
  });

  it("creates a valid cash row", async () => {
    const result = await createAllocationTarget({
      kind: "cash",
      name: "Revolut USD",
      targetWeight: 5,
      cashAmountUsd: 2500,
    });
    expect(result.success).toBe(true);
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "cash", name: "Revolut USD", cashAmountUsd: 2500 }),
    );
  });

  it("rejects cash row with negative amount", async () => {
    const result = await createAllocationTarget({
      kind: "cash",
      name: "Bad",
      targetWeight: 5,
      cashAmountUsd: -100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.cashAmountUsd).toBeDefined();
    }
  });

  it("rejects empty name", async () => {
    const result = await createAllocationTarget({
      kind: "ticker",
      name: "",
      targetWeight: 10,
      cashAmountUsd: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.name).toBeDefined();
    }
  });

  it("rejects target weight over 100", async () => {
    const result = await createAllocationTarget({
      kind: "ticker",
      name: "AAPL",
      targetWeight: 150,
      cashAmountUsd: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.targetWeight).toBeDefined();
    }
  });

  it("returns duplicate error on UNIQUE constraint", async () => {
    mocks.mockInsertRun.mockImplementationOnce(() => {
      throw new Error("SQLITE_CONSTRAINT: UNIQUE constraint failed: allocation_targets.kind, allocation_targets.name");
    });

    const result = await createAllocationTarget({
      kind: "ticker",
      name: "AAPL",
      targetWeight: 10,
      cashAmountUsd: null,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.name).toBe("Already exists");
    }
  });
});

describe("updateAllocationTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGet.mockReturnValue(null);
  });

  it("returns error when row not found", async () => {
    mocks.mockGet.mockReturnValue(null);
    const result = await updateAllocationTarget(99, "targetWeight", 10);
    expect(result.success).toBe(false);
  });

  it("updates target weight on existing row", async () => {
    mocks.mockGet.mockReturnValue(existingTickerRow());
    const result = await updateAllocationTarget(1, "targetWeight", 55);
    expect(result.success).toBe(true);
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ targetWeight: 55 }),
    );
  });

  it("rejects invalid field", async () => {
    mocks.mockGet.mockReturnValue(existingTickerRow());
    const result = await updateAllocationTarget(
      1,
      "kind" as never,
      "cash",
    );
    expect(result.success).toBe(false);
  });

  it("rejects setting cashAmountUsd on a ticker row", async () => {
    mocks.mockGet.mockReturnValue(existingTickerRow());
    const result = await updateAllocationTarget(1, "cashAmountUsd", 1000);
    expect(result.success).toBe(false);
  });

  it("updates name on cash row without uppercasing", async () => {
    mocks.mockGet.mockReturnValue(existingCashRow());
    const result = await updateAllocationTarget(2, "name", "Revolut GBP");
    expect(result.success).toBe(true);
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Revolut GBP" }),
    );
  });

  it("rejects negative target weight", async () => {
    mocks.mockGet.mockReturnValue(existingTickerRow());
    const result = await updateAllocationTarget(1, "targetWeight", -5);
    expect(result.success).toBe(false);
  });
});

describe("deleteAllocationTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockGet.mockReturnValue(null);
  });

  it("rejects invalid id", async () => {
    const result = await deleteAllocationTarget(0);
    expect(result.success).toBe(false);
  });

  it("returns error when row not found", async () => {
    mocks.mockGet.mockReturnValue(null);
    const result = await deleteAllocationTarget(99);
    expect(result.success).toBe(false);
  });

  it("deletes an existing row", async () => {
    mocks.mockGet.mockReturnValue(existingTickerRow());
    const result = await deleteAllocationTarget(1);
    expect(result.success).toBe(true);
    expect(mocks.mockDeleteRun).toHaveBeenCalled();
  });
});
