import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/queries/app-settings", () => ({
  getCashTargetWeight: vi.fn().mockReturnValue(5),
  setCashTargetWeight: vi.fn(),
}));

vi.mock("@/server/db", () => {
  const mockUpdateRun = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({ run: mockUpdateRun });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockGet = vi.fn().mockReturnValue(undefined);
  const mockAll = vi.fn().mockReturnValue([]);
  const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll });
  const mockSelectWhere = vi.fn().mockReturnValue({
    get: mockGet,
    all: mockAll,
    orderBy: mockOrderBy,
  });
  const mockSelectFrom = vi.fn().mockReturnValue({
    where: mockSelectWhere,
    all: mockAll,
    orderBy: mockOrderBy,
  });
  const mockSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });

  const mockInsertRun = vi.fn().mockReturnValue({ lastInsertRowid: 99 });
  const mockValues = vi.fn().mockReturnValue({ run: mockInsertRun });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });

  const mockDeleteRun = vi.fn().mockReturnValue({ changes: 1 });
  const mockDeleteWhere = vi.fn().mockReturnValue({ run: mockDeleteRun });
  const mockDelete = vi.fn().mockReturnValue({ where: mockDeleteWhere });

  const dbMock = {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    delete: mockDelete,
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(dbMock)),
    _mocks: {
      mockGet,
      mockAll,
      mockUpdateRun,
      mockSet,
      mockInsertRun,
      mockValues,
      mockDelete,
    },
  };
  return { db: dbMock };
});

import { db } from "@/server/db";
import {
  getCashTargetWeight,
  setCashTargetWeight,
} from "@/server/queries/app-settings";
import {
  finalizeThesis,
  rejectDraft,
  updatePriceLevels,
  setAddDownState,
  applyTargetToAllocation,
} from "./theses";
import type { FinalizeThesisInput } from "@/shared/schemas/position-thesis";

const mocks = (
  db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> }
)._mocks;

function thesisRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    ticker: "ASML",
    bucket: "active" as const,
    sector: "Technology",
    conviction: 4,
    promiseRank: 3,
    keepDecision: "keep" as const,
    targetWeightPct: null as number | null,
    thesis: "EUV monopoly",
    keyRisk: "Export controls",
    catalyst: "High-NA ramp",
    breakConditions: '["Loses EUV monopoly","Bookings decline 2y straight"]',
    horizonMonths: 24,
    expiresAt: null as string | null,
    entryZoneLow: null as number | null,
    entryZoneHigh: null as number | null,
    entryNote: null as string | null,
    addLevel: null as number | null,
    addMaxSizePct: null as number | null,
    addNote: null as string | null,
    addDownState: "available" as const,
    technicalBackstop: null as number | null,
    backstopNote: null as string | null,
    technicalContext: null as string | null,
    status: "draft" as const,
    version: 1,
    isCurrent: false,
    source: "underwrite_name" as const,
    changeReason: null as string | null,
    critiqueVerdict: "survives" as const,
    critiqueCounter: "Cycle risk",
    createdAt: "2026-08-01T00:00:00.000Z",
    reviewedAt: null as string | null,
    ...overrides,
  };
}

const nullLevels = {
  entryZoneLow: null,
  entryZoneHigh: null,
  entryNote: null,
  addLevel: null,
  addMaxSizePct: null,
  addNote: null,
  technicalBackstop: null,
  backstopNote: null,
};

function finalizeEdits(
  overrides: Partial<FinalizeThesisInput> = {},
): FinalizeThesisInput {
  return {
    bucket: "active",
    sector: "Technology",
    conviction: 4,
    promiseRank: 3,
    keepDecision: "keep",
    targetWeightPct: null,
    thesis: "EUV monopoly",
    keyRisk: "Export controls",
    catalyst: "High-NA ramp",
    breakConditions: ["Loses EUV monopoly", "Bookings decline 2y straight"],
    horizonMonths: 24,
    levels: { ...nullLevels },
    changeReason: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGet.mockReturnValue(undefined);
  mocks.mockAll.mockReturnValue([]);
  vi.mocked(getCashTargetWeight).mockReturnValue(5);
});

describe("finalizeThesis", () => {
  it("finalizes a v1 draft: derives ladder weight, stamps reviewed_at + expires_at", async () => {
    mocks.mockGet
      .mockReturnValueOnce(thesisRow()) // getDraftById
      .mockReturnValueOnce(undefined); // getCurrentFinal (no prior)

    const result = await finalizeThesis(10, finalizeEdits());
    expect(result.success).toBe(true);

    // Two updates: the draft promotion (no prior to supersede) + the no-op
    // watchlist researched→watchlisted transition.
    expect(mocks.mockSet).toHaveBeenCalledTimes(2);
    const set = mocks.mockSet.mock.calls[0][0];
    expect(set.status).toBe("final");
    expect(set.isCurrent).toBe(true);
    expect(set.targetWeightPct).toBe(4.5); // conviction 4 → ladder 4.5
    expect(typeof set.reviewedAt).toBe("string");
    expect(typeof set.expiresAt).toBe("string");
    // expiry ≈ reviewedAt + 24 months
    expect(new Date(set.expiresAt).getFullYear()).toBe(
      new Date(set.reviewedAt).getFullYear() + 2,
    );
  });

  it("supersedes the prior current final in the same transaction", async () => {
    mocks.mockGet
      .mockReturnValueOnce(
        thesisRow({ id: 20, version: 2, changeReason: "delta" }),
      )
      .mockReturnValueOnce(
        thesisRow({ id: 10, status: "final", isCurrent: true }),
      );

    const result = await finalizeThesis(
      20,
      finalizeEdits({ changeReason: "Conviction downgrade after Q2" }),
    );
    expect(result.success).toBe(true);
    expect(mocks.mockSet).toHaveBeenCalledTimes(3);
    expect(mocks.mockSet.mock.calls[0][0]).toEqual({
      status: "superseded",
      isCurrent: false,
    });
    expect(mocks.mockSet.mock.calls[1][0].status).toBe("final");
    // Third: watchlist transition (no-op unless the row is `researched`).
    expect(mocks.mockSet.mock.calls[2][0].status).toBe("watchlisted");
  });

  it("requires a change reason on version > 1", async () => {
    mocks.mockGet.mockReturnValueOnce(thesisRow({ version: 2 }));
    const result = await finalizeThesis(10, finalizeEdits());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.changeReason).toBeDefined();
    }
    expect(mocks.mockSet).not.toHaveBeenCalled();
  });

  it("honours a target weight override over the ladder", async () => {
    mocks.mockGet
      .mockReturnValueOnce(thesisRow())
      .mockReturnValueOnce(undefined);
    const result = await finalizeThesis(
      10,
      finalizeEdits({ targetWeightPct: 3.0 }),
    );
    expect(result.success).toBe(true);
    expect(mocks.mockSet.mock.calls[0][0].targetWeightPct).toBe(3.0);
  });

  it("cut decisions get a 0 target and no expiry", async () => {
    mocks.mockGet
      .mockReturnValueOnce(thesisRow())
      .mockReturnValueOnce(undefined);
    const result = await finalizeThesis(
      10,
      finalizeEdits({
        keepDecision: "cut",
        horizonMonths: null,
        breakConditions: null,
      }),
    );
    expect(result.success).toBe(true);
    const set = mocks.mockSet.mock.calls[0][0];
    expect(set.targetWeightPct).toBe(0);
    expect(set.expiresAt).toBeNull();
    // A cut verdict on a researched watchlist candidate means "don't buy".
    expect(mocks.mockSet.mock.calls[1][0].status).toBe("rejected");
  });

  it("rejects finalizing a non-draft row", async () => {
    mocks.mockGet.mockReturnValueOnce(thesisRow({ status: "final" }));
    const result = await finalizeThesis(10, finalizeEdits());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("not a draft");
    }
  });

  it("requires a displacement note when a new name enters a full sleeve", async () => {
    mocks.mockGet.mockReturnValueOnce(thesisRow({ ticker: "NEW" }));
    mocks.mockAll.mockReturnValueOnce(
      Array.from({ length: 8 }, (_, i) =>
        thesisRow({
          id: 100 + i,
          ticker: `T${i}`,
          status: "final",
          isCurrent: true,
        }),
      ),
    );
    const result = await finalizeThesis(10, finalizeEdits());
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("displaced incumbent");
    }
  });

  it("returns field errors for invalid edits", async () => {
    const result = await finalizeThesis(
      10,
      finalizeEdits({ conviction: null }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors?.conviction).toBeDefined();
    }
  });
});

describe("rejectDraft", () => {
  it("rejects a draft and records the reason", async () => {
    mocks.mockGet.mockReturnValueOnce(thesisRow());
    const result = await rejectDraft(10, "Thesis rests on a single customer");
    expect(result.success).toBe(true);
    expect(mocks.mockSet).toHaveBeenCalledWith({
      status: "rejected",
      isCurrent: false,
      changeReason: "Thesis rests on a single customer",
    });
  });

  it("requires a reason", async () => {
    const result = await rejectDraft(10, "  ");
    expect(result.success).toBe(false);
  });

  it("refuses to reject a final row", async () => {
    mocks.mockGet.mockReturnValueOnce(thesisRow({ status: "final" }));
    const result = await rejectDraft(10, "reason");
    expect(result.success).toBe(false);
  });
});

describe("updatePriceLevels", () => {
  const levels = {
    ...nullLevels,
    entryZoneLow: 600,
    entryZoneHigh: 680,
    addLevel: 550,
    technicalBackstop: 500,
  };

  it("appends a new version cloning the current final, carrying review clocks", async () => {
    mocks.mockGet.mockReturnValueOnce(
      thesisRow({
        id: 10,
        status: "final",
        isCurrent: true,
        version: 3,
        reviewedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: "2028-07-01T00:00:00.000Z",
      }),
    );

    const result = await updatePriceLevels("asml", levels, "Post-earnings reset");
    expect(result.success).toBe(true);

    expect(mocks.mockSet).toHaveBeenCalledWith({
      status: "superseded",
      isCurrent: false,
    });
    const inserted = mocks.mockValues.mock.calls[0][0];
    expect(inserted.version).toBe(4);
    expect(inserted.status).toBe("final");
    expect(inserted.isCurrent).toBe(true);
    expect(inserted.entryZoneLow).toBe(600);
    expect(inserted.technicalBackstop).toBe(500);
    expect(inserted.changeReason).toBe("Post-earnings reset");
    // Not a re-underwrite: cooling + horizon clocks must not reset.
    expect(inserted.reviewedAt).toBe("2026-07-01T00:00:00.000Z");
    expect(inserted.expiresAt).toBe("2028-07-01T00:00:00.000Z");
    expect(inserted.id).toBeUndefined();
  });

  it("requires a change reason and a current final", async () => {
    const noReason = await updatePriceLevels("ASML", levels, "  ");
    expect(noReason.success).toBe(false);

    mocks.mockGet.mockReturnValueOnce(undefined);
    const noFinal = await updatePriceLevels("ASML", levels, "reason");
    expect(noFinal.success).toBe(false);
  });

  it("rejects an inverted entry zone", async () => {
    const result = await updatePriceLevels(
      "ASML",
      { ...levels, entryZoneLow: 700 },
      "reason",
    );
    expect(result.success).toBe(false);
  });
});

describe("setAddDownState", () => {
  it("flips available → used and appends the reason to the add note", async () => {
    mocks.mockGet.mockReturnValueOnce(
      thesisRow({
        status: "final",
        isCurrent: true,
        addNote: "One add below 550",
        addDownState: "available",
      }),
    );
    const result = await setAddDownState("ASML", "used", "Filled at 545");
    expect(result.success).toBe(true);
    const set = mocks.mockSet.mock.calls[0][0];
    expect(set.addDownState).toBe("used");
    expect(set.addNote).toContain("One add below 550");
    expect(set.addNote).toContain("Filled at 545");
  });

  it("refuses transitions from a consumed state", async () => {
    mocks.mockGet.mockReturnValueOnce(
      thesisRow({ status: "final", isCurrent: true, addDownState: "used" }),
    );
    const result = await setAddDownState("ASML", "void");
    expect(result.success).toBe(false);
    expect(mocks.mockSet).not.toHaveBeenCalled();
  });

  it("refuses a no-op flip to available", async () => {
    mocks.mockGet.mockReturnValueOnce(
      thesisRow({ status: "final", isCurrent: true, addDownState: "available" }),
    );
    const result = await setAddDownState("ASML", "available");
    expect(result.success).toBe(false);
  });
});

describe("applyTargetToAllocation", () => {
  function activeFinal(ticker: string, weight: number, id: number) {
    return thesisRow({
      id,
      ticker,
      status: "final",
      isCurrent: true,
      targetWeightPct: weight,
    });
  }

  it("writes the reconciled weight and moves the residual into cash", async () => {
    const asml = activeFinal("ASML", 5.5, 1);
    mocks.mockGet
      .mockReturnValueOnce(asml) // getCurrentFinal
      .mockReturnValueOnce({
        // existing allocation row
        id: 7,
        kind: "ticker",
        name: "ASML",
        bucket: "active",
        targetWeight: 4,
        cashAmountUsd: null,
        sortOrder: 1,
        createdAt: "x",
        updatedAt: "x",
      });
    mocks.mockAll.mockReturnValueOnce([asml, activeFinal("CRWD", 4.5, 2)]);

    const result = await applyTargetToAllocation("asml");
    expect(result.success).toBe(true);
    // Sum 10 ≤ 35 → no scaling; ASML gets its ladder 5.5.
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ targetWeight: 5.5, bucket: "active" }),
    );
    // Cash absorbs the +1.5 move: 5 − 1.5 = 3.5.
    expect(setCashTargetWeight).toHaveBeenCalledWith(3.5);
    // Graduation: the watchlist row (if any) retires.
    expect(mocks.mockDelete).toHaveBeenCalledTimes(1);
  });

  it("scales pro-rata when the ladder sum exceeds the bucket", async () => {
    const a = activeFinal("AAA", 22, 1);
    const b = activeFinal("BBB", 22, 2);
    mocks.mockGet.mockReturnValueOnce(a).mockReturnValueOnce(undefined);
    mocks.mockAll
      .mockReturnValueOnce([a, b]) // active finals
      .mockReturnValueOnce([{ sortOrder: 3 }]); // max sort for insert
    vi.mocked(getCashTargetWeight).mockReturnValue(30);

    const result = await applyTargetToAllocation("AAA");
    expect(result.success).toBe(true);
    // 44 → scaled to 35: each 22 × 35/44 = 17.5. New row inserted.
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "ticker",
        name: "AAA",
        targetWeight: 17.5,
        sortOrder: 4,
      }),
    );
    expect(setCashTargetWeight).toHaveBeenCalledWith(12.5);
  });

  it("refuses when the cash residual would go negative", async () => {
    const a = activeFinal("AAA", 5.5, 1);
    mocks.mockGet.mockReturnValueOnce(a).mockReturnValueOnce(undefined);
    mocks.mockAll.mockReturnValueOnce([a]);
    vi.mocked(getCashTargetWeight).mockReturnValue(2);

    const result = await applyTargetToAllocation("AAA");
    expect(result.success).toBe(false);
    expect(setCashTargetWeight).not.toHaveBeenCalled();
  });

  it("refuses core theses and missing ladder weights", async () => {
    mocks.mockGet.mockReturnValueOnce(
      thesisRow({ bucket: "core", status: "final", isCurrent: true }),
    );
    const core = await applyTargetToAllocation("VT");
    expect(core.success).toBe(false);

    mocks.mockGet.mockReturnValueOnce(
      thesisRow({ status: "final", isCurrent: true, targetWeightPct: null }),
    );
    const noWeight = await applyTargetToAllocation("ASML");
    expect(noWeight.success).toBe(false);
  });

  it("errors when no current final exists", async () => {
    const result = await applyTargetToAllocation("NOPE");
    expect(result.success).toBe(false);
  });
});
