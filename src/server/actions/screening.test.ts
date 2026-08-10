import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/server/services/fmp", () => ({
  fetchScreenerCompanies: vi.fn(),
  fetchRatiosTtm: vi.fn().mockResolvedValue({ ok: true, data: null }),
  fetchKeyMetricsTtm: vi.fn().mockResolvedValue({ ok: true, data: null }),
  fetchForwardEps: vi.fn().mockResolvedValue({ ok: true, data: null }),
  fetchPriceChange: vi.fn().mockResolvedValue({ ok: true, data: null }),
  fetchStockPrices: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/server/db/market-data-writer", () => ({
  upsertMarketDataRows: vi.fn().mockReturnValue(1),
}));

vi.mock("@/server/db", () => {
  const mockUpdateRun = vi.fn();
  const mockUpdateWhere = vi.fn().mockReturnValue({ run: mockUpdateRun });
  const mockSet = vi.fn().mockReturnValue({ where: mockUpdateWhere });
  const mockUpdate = vi.fn().mockReturnValue({ set: mockSet });

  const mockGet = vi.fn().mockReturnValue(undefined);
  const mockAll = vi.fn().mockReturnValue([]);
  const mockLimit = vi.fn().mockReturnValue({ get: mockGet });
  const mockOrderBy = vi.fn().mockReturnValue({ all: mockAll, limit: mockLimit });
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

  const mockInsertRun = vi.fn().mockReturnValue({ lastInsertRowid: 7 });
  const mockValues = vi.fn().mockReturnValue({
    run: mockInsertRun,
    onConflictDoUpdate: vi.fn().mockReturnValue({ run: mockInsertRun }),
  });
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  const mockDelete = vi.fn().mockReturnValue({
    where: vi.fn().mockReturnValue({ run: vi.fn() }),
  });

  const dbMock = {
    select: mockSelect,
    update: mockUpdate,
    insert: mockInsert,
    delete: mockDelete,
    transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(dbMock)),
    _mocks: { mockGet, mockAll, mockSet, mockValues, mockInsertRun },
  };
  return { db: dbMock };
});

import { db } from "@/server/db";
import {
  fetchScreenerCompanies,
  fetchRatiosTtm,
  fetchKeyMetricsTtm,
  fetchForwardEps,
  fetchPriceChange,
  fetchStockPrices,
} from "@/server/services/fmp";
import { upsertMarketDataRows } from "@/server/db/market-data-writer";
import { runScreen, flagForResearch, setWatchlistStatus } from "./screening";

const mocks = (
  db as unknown as { _mocks: Record<string, ReturnType<typeof vi.fn>> }
)._mocks;

function screenerCompany(symbol: string, overrides: Record<string, unknown> = {}) {
  return {
    symbol,
    companyName: `${symbol} Inc`,
    marketCap: 10_000_000_000,
    sector: "Technology",
    industry: "Software",
    price: 100,
    volume: 1_000_000,
    exchangeShortName: "NASDAQ",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mockGet.mockReturnValue(undefined);
  mocks.mockAll.mockReturnValue([]);
  vi.mocked(fetchScreenerCompanies).mockResolvedValue([]);
  vi.mocked(fetchRatiosTtm).mockResolvedValue({ ok: true, data: null });
  vi.mocked(fetchKeyMetricsTtm).mockResolvedValue({ ok: true, data: null });
  vi.mocked(fetchForwardEps).mockResolvedValue({ ok: true, data: null });
  vi.mocked(fetchPriceChange).mockResolvedValue({ ok: true, data: null });
  vi.mocked(fetchStockPrices).mockResolvedValue([]);
});

describe("runScreen", () => {
  it("applies criteria defaults and stores a run with scored results", async () => {
    vi.mocked(fetchScreenerCompanies).mockResolvedValue([
      screenerCompany("AAA"),
      screenerCompany("BBB"),
    ]);
    vi.mocked(fetchRatiosTtm).mockImplementation(async (ticker: string) => ({
      ok: true,
      data: {
        peTtm: ticker === "AAA" ? 10 : 40,
        epsTtm: 5,
        divYieldTtm: null,
        psTtm: ticker === "AAA" ? 2 : 12,
        pbTtm: null,
        pfcfTtm: ticker === "AAA" ? 12 : 50,
        evEbitdaTtm: null,
        netMarginTtm: ticker === "AAA" ? 0.25 : 0.05,
        debtToEquityTtm: ticker === "AAA" ? 0.3 : 2,
      },
    }));
    vi.mocked(fetchPriceChange).mockResolvedValue({
      ok: true,
      data: { change1m: 1, change3m: 5, change6m: 10, change1y: 20 },
    });

    const result = await runScreen({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        runId: 7,
        scored: 2,
        failed: 0,
        truncated: false,
      });
    }

    expect(fetchScreenerCompanies).toHaveBeenCalledWith({
      marketCapMoreThan: 2_000_000_000,
      marketCapLowerThan: null,
      volumeMoreThan: 500_000,
      sector: null,
      limit: 1000,
    });

    // 1 run row + 2 result rows inserted.
    expect(mocks.mockValues).toHaveBeenCalledTimes(3);
    const runRow = mocks.mockValues.mock.calls[0][0];
    expect(runRow.universeCount).toBe(2);
    expect(JSON.parse(runRow.criteriaJson).limit).toBe(1000);

    const aaa = mocks.mockValues.mock.calls.find(
      (c) => c[0].ticker === "AAA",
    )?.[0];
    const bbb = mocks.mockValues.mock.calls.find(
      (c) => c[0].ticker === "BBB",
    )?.[0];
    // Cheap/quality AAA outranks expensive/levered BBB deterministically.
    expect(aaa.compositeScore).toBeGreaterThan(bbb.compositeScore);
    expect(aaa.runId).toBe(7);
    expect(aaa.peTtm).toBe(10);
  });

  it("counts metric-free tickers as failed but still stores them", async () => {
    vi.mocked(fetchScreenerCompanies).mockResolvedValue([
      screenerCompany("GOOD"),
      screenerCompany("DEAD"),
    ]);
    vi.mocked(fetchRatiosTtm).mockImplementation(async (ticker: string) => ({
      ok: true,
      data:
        ticker === "GOOD"
          ? {
              peTtm: 10,
              epsTtm: 5,
              divYieldTtm: null,
              psTtm: 2,
              pbTtm: null,
              pfcfTtm: 12,
              evEbitdaTtm: 8,
              netMarginTtm: 0.2,
              debtToEquityTtm: 0.5,
            }
          : null,
    }));

    const result = await runScreen({ limit: 50 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.scored).toBe(1);
      expect(result.data.failed).toBe(1);
      expect(result.data.truncated).toBe(false);
    }
    // Both rows stored — universe count stays honest.
    expect(mocks.mockValues).toHaveBeenCalledTimes(3);
  });

  it("flags a truncated universe when the safety cap binds", async () => {
    vi.mocked(fetchScreenerCompanies).mockResolvedValue([
      screenerCompany("AAA"),
      screenerCompany("BBB"),
    ]);

    const result = await runScreen({ limit: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.truncated).toBe(true);
    }
  });

  it("passes the band and sector through and rejects an inverted band", async () => {
    vi.mocked(fetchScreenerCompanies).mockResolvedValue([screenerCompany("MID")]);

    const banded = await runScreen({
      marketCapMoreThan: 2_000_000_000,
      marketCapLowerThan: 30_000_000_000,
      sector: "Industrials",
    });
    expect(banded.success).toBe(true);
    expect(fetchScreenerCompanies).toHaveBeenCalledWith(
      expect.objectContaining({
        marketCapLowerThan: 30_000_000_000,
        sector: "Industrials",
      }),
    );

    const inverted = await runScreen({
      marketCapMoreThan: 30_000_000_000,
      marketCapLowerThan: 2_000_000_000,
    });
    expect(inverted.success).toBe(false);
  });

  it("retries a failed fetch once and scores the ticker when it recovers", async () => {
    vi.mocked(fetchScreenerCompanies).mockResolvedValue([
      screenerCompany("FLAKY"),
    ]);
    vi.mocked(fetchRatiosTtm)
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValue({
        ok: true,
        data: {
          peTtm: 10,
          epsTtm: 5,
          divYieldTtm: null,
          psTtm: 2,
          pbTtm: null,
          pfcfTtm: 12,
          evEbitdaTtm: 8,
          netMarginTtm: 0.2,
          debtToEquityTtm: 0.5,
        },
      });

    const result = await runScreen({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.failed).toBe(0);
    }
    expect(fetchRatiosTtm).toHaveBeenCalledTimes(2);
    const row = mocks.mockValues.mock.calls.find(
      (c) => c[0].ticker === "FLAKY",
    )?.[0];
    expect(row.peTtm).toBe(10);
  });

  it("degrades a still-failing ticker to all-null — partial data never ranks", async () => {
    // 1 of 7 degraded = 14.3%, just under the 15% abort threshold.
    vi.mocked(fetchScreenerCompanies).mockResolvedValue(
      ["A1", "A2", "A3", "A4", "A5", "A6", "BAD"].map((t) => screenerCompany(t)),
    );
    vi.mocked(fetchRatiosTtm).mockResolvedValue({
      ok: true,
      data: {
        peTtm: 10,
        epsTtm: 5,
        divYieldTtm: null,
        psTtm: 2,
        pbTtm: null,
        pfcfTtm: 12,
        evEbitdaTtm: 8,
        netMarginTtm: 0.2,
        debtToEquityTtm: 0.5,
      },
    });
    vi.mocked(fetchPriceChange).mockImplementation(async (ticker: string) =>
      ticker === "BAD"
        ? { ok: false }
        : {
            ok: true,
            data: { change1m: 1, change3m: 5, change6m: 10, change1y: 20 },
          },
    );

    const result = await runScreen({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.failed).toBe(1);
    }
    const bad = mocks.mockValues.mock.calls.find(
      (c) => c[0].ticker === "BAD",
    )?.[0];
    // Ratios succeeded for BAD, but a degraded ticker is stored ALL-null.
    expect(bad.peTtm).toBeNull();
    expect(bad.compositeScore).toBeNull();
  });

  it("aborts and writes nothing when too many tickers stay degraded", async () => {
    vi.mocked(fetchScreenerCompanies).mockResolvedValue([
      screenerCompany("OK1"),
      screenerCompany("BAD"),
    ]);
    vi.mocked(fetchRatiosTtm).mockImplementation(async (ticker: string) =>
      ticker === "BAD" ? { ok: false } : { ok: true, data: null },
    );

    const result = await runScreen({});
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("aborted");
    }
    expect(mocks.mockValues).not.toHaveBeenCalled();
  });

  it("fails when the screener returns nothing", async () => {
    const result = await runScreen({});
    expect(result.success).toBe(false);
    expect(mocks.mockValues).not.toHaveBeenCalled();
  });

  it("rejects invalid criteria", async () => {
    const result = await runScreen({ limit: 5000 });
    expect(result.success).toBe(false);
    expect(fetchScreenerCompanies).not.toHaveBeenCalled();
  });
});

describe("flagForResearch", () => {
  it("inserts a new watchlist row and backfills 1y of prices", async () => {
    vi.mocked(fetchStockPrices).mockResolvedValue([
      { symbol: "ASML", date: "2025-08-04", price: 700, volume: 1 },
    ]);

    const result = await flagForResearch("asml", 7);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backfilled).toBe(1);
    }
    expect(mocks.mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: "ASML",
        status: "flagged_for_research",
        sourceRunId: 7,
      }),
    );
    expect(fetchStockPrices).toHaveBeenCalledWith(["ASML"], expect.any(String));
    expect(upsertMarketDataRows).toHaveBeenCalled();
  });

  it("re-flags a rejected row but refuses researched/watchlisted names", async () => {
    mocks.mockGet.mockReturnValueOnce({
      id: 1,
      ticker: "ASML",
      status: "rejected",
      sourceRunId: null,
      note: null,
      createdAt: "x",
      updatedAt: "x",
    });
    const reflag = await flagForResearch("ASML");
    expect(reflag.success).toBe(true);
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "flagged_for_research" }),
    );

    mocks.mockGet.mockReturnValueOnce({
      id: 2,
      ticker: "CRWD",
      status: "researched",
    });
    const refused = await flagForResearch("CRWD");
    expect(refused.success).toBe(false);
  });

  it("still flags when the price backfill returns nothing", async () => {
    const result = await flagForResearch("NEWCO");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.backfilled).toBe(0);
    }
    expect(upsertMarketDataRows).not.toHaveBeenCalled();
  });
});

describe("setWatchlistStatus", () => {
  it("applies a legal transition", async () => {
    mocks.mockGet.mockReturnValueOnce({
      id: 1,
      ticker: "ASML",
      status: "flagged_for_research",
    });
    const result = await setWatchlistStatus("ASML", "candidate");
    expect(result.success).toBe(true);
    expect(mocks.mockSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "candidate" }),
    );
  });

  it("refuses illegal transitions and unknown tickers", async () => {
    mocks.mockGet.mockReturnValueOnce({
      id: 1,
      ticker: "ASML",
      status: "candidate",
    });
    const illegal = await setWatchlistStatus("ASML", "watchlisted");
    expect(illegal.success).toBe(false);

    const missing = await setWatchlistStatus("GHOST", "rejected");
    expect(missing.success).toBe(false);
  });
});
