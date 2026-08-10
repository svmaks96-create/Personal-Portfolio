import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchStockPrices,
  fetchFxRates,
  fetchCompanyProfile,
  fetchTickerProfileFull,
  fetchRatiosTtm,
  selectForwardEps,
  fetchScreenerCompanies,
  fetchPriceChange,
} from "./fmp";

// Mock config to control API key
vi.mock("@/server/config", () => ({
  config: { fmpApiKey: "test-api-key" },
}));

function mockFetchResponse(data: unknown, ok = true) {
  return vi.spyOn(global, "fetch").mockResolvedValue(
    new Response(JSON.stringify(data), {
      status: ok ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("fetchStockPrices", () => {
  it("returns empty array for empty tickers", async () => {
    const spy = vi.spyOn(global, "fetch");
    const result = await fetchStockPrices([]);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches a single ticker via EOD light endpoint", async () => {
    const eodQuote = { symbol: "AAPL", date: "2026-04-15", price: 258.86, volume: 29319825 };
    mockFetchResponse([eodQuote]);

    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([eodQuote]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/historical-price-eod/light?symbol=AAPL&from=")
    );
  });

  it("fetches multiple tickers in parallel", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      if (urlStr.includes("AAPL")) {
        return new Response(
          JSON.stringify([{ symbol: "AAPL", date: "2026-04-15", price: 258.86, volume: 100 }])
        );
      }
      return new Response(
        JSON.stringify([{ symbol: "MSFT", date: "2026-04-15", price: 410.5, volume: 200 }])
      );
    });

    const result = await fetchStockPrices(["AAPL", "MSFT"]);
    expect(result).toHaveLength(2);
    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ symbol: "AAPL", price: 258.86 }),
        expect.objectContaining({ symbol: "MSFT", price: 410.5 }),
      ])
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty array on network failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([]);
  });

  it("returns empty array on non-200 response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("Server Error", { status: 500 })
    );
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([]);
  });

  it("returns empty array on invalid JSON", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("not json", { status: 200 })
    );
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([]);
  });

  it("returns empty array when response is not an array", async () => {
    mockFetchResponse({ error: "Invalid symbol" });
    const result = await fetchStockPrices(["INVALID"]);
    expect(result).toEqual([]);
  });

  it("filters out items with missing price field", async () => {
    mockFetchResponse([
      { symbol: "AAPL", date: "2026-04-15" },
      { symbol: "MSFT", date: "2026-04-15", price: 410.5, volume: 200 },
    ]);
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([{ symbol: "MSFT", date: "2026-04-15", price: 410.5, volume: 200 }]);
  });

  it("filters out items with NaN or Infinity price", async () => {
    mockFetchResponse([
      { symbol: "BAD1", date: "2026-04-15", price: NaN, volume: 0 },
      { symbol: "BAD2", date: "2026-04-15", price: Infinity, volume: 0 },
      { symbol: "GOOD", date: "2026-04-15", price: 100, volume: 50 },
    ]);
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([{ symbol: "GOOD", date: "2026-04-15", price: 100, volume: 50 }]);
  });

  it("filters out items with missing or invalid date", async () => {
    mockFetchResponse([
      { symbol: "NODATE", price: 100, volume: 50 },
      { symbol: "BADDATE", date: "2026-04", price: 100, volume: 50 },
      { symbol: "GOOD", date: "2026-04-15", price: 100, volume: 50 },
    ]);
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([{ symbol: "GOOD", date: "2026-04-15", price: 100, volume: 50 }]);
  });

  it("returns multiple days per ticker from EOD response", async () => {
    mockFetchResponse([
      { symbol: "AAPL", date: "2026-04-15", price: 266.43, volume: 49913510 },
      { symbol: "AAPL", date: "2026-04-14", price: 258.83, volume: 48370710 },
    ]);
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toHaveLength(2);
  });

  it("handles partial failures gracefully", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      if (urlStr.includes("AAPL")) {
        return new Response(
          JSON.stringify([{ symbol: "AAPL", date: "2026-04-15", price: 258.86, volume: 100 }])
        );
      }
      return new Response("error", { status: 500 });
    });

    const result = await fetchStockPrices(["AAPL", "INVALID"]);
    expect(result).toEqual([{ symbol: "AAPL", date: "2026-04-15", price: 258.86, volume: 100 }]);
  });
});

describe("fetchFxRates", () => {
  it("returns empty array for empty currencies", async () => {
    const spy = vi.spyOn(global, "fetch");
    const result = await fetchFxRates([]);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches a single FX rate via EOD light endpoint", async () => {
    const fxQuote = { symbol: "GBPUSD", date: "2026-04-15", price: 1.32344, volume: 71487 };
    mockFetchResponse([fxQuote]);

    const result = await fetchFxRates(["GBP"]);
    expect(result).toEqual([fxQuote]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/historical-price-eod/light?symbol=GBPUSD&from=")
    );
  });

  it("fetches multiple FX rates in parallel", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      if (urlStr.includes("GBPUSD")) {
        return new Response(
          JSON.stringify([{ symbol: "GBPUSD", date: "2026-04-15", price: 1.32, volume: 100 }])
        );
      }
      return new Response(
        JSON.stringify([{ symbol: "EURUSD", date: "2026-04-15", price: 1.08, volume: 200 }])
      );
    });

    const result = await fetchFxRates(["GBP", "EUR"]);
    expect(result).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("returns empty array on network failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network error"));
    const result = await fetchFxRates(["GBP"]);
    expect(result).toEqual([]);
  });

  it("returns empty array on non-200 response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("error", { status: 500 })
    );
    const result = await fetchFxRates(["GBP"]);
    expect(result).toEqual([]);
  });
});

describe("fetchCompanyProfile", () => {
  it("returns null for empty ticker", async () => {
    const spy = vi.spyOn(global, "fetch");
    const result = await fetchCompanyProfile("");
    expect(result).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses symbol, companyName, and isEtf from /profile response", async () => {
    mockFetchResponse([
      { symbol: "AAPL", companyName: "Apple Inc.", isEtf: false, price: 258.86 },
    ]);
    const result = await fetchCompanyProfile("AAPL");
    expect(result).toEqual({
      symbol: "AAPL",
      companyName: "Apple Inc.",
      isEtf: false,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/profile?symbol=AAPL&apikey=test-api-key")
    );
  });

  it("returns companyName null when FMP omits it", async () => {
    mockFetchResponse([{ symbol: "XXX", isEtf: true }]);
    const result = await fetchCompanyProfile("XXX");
    expect(result).toEqual({ symbol: "XXX", companyName: null, isEtf: true });
  });

  it("returns companyName null when FMP returns an empty string", async () => {
    mockFetchResponse([{ symbol: "XXX", companyName: "", isEtf: false }]);
    const result = await fetchCompanyProfile("XXX");
    expect(result?.companyName).toBeNull();
  });

  it("returns null when response is not an array", async () => {
    mockFetchResponse({ error: "not found" });
    const result = await fetchCompanyProfile("INVALID");
    expect(result).toBeNull();
  });

  it("returns null when required fields are missing", async () => {
    mockFetchResponse([{ symbol: "AAPL" }]);
    const result = await fetchCompanyProfile("AAPL");
    expect(result).toBeNull();
  });

  it("returns null on network failure", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("boom"));
    const result = await fetchCompanyProfile("AAPL");
    expect(result).toBeNull();
  });

  it("returns null on non-200 response", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    const result = await fetchCompanyProfile("AAPL");
    expect(result).toBeNull();
  });
});

describe("selectForwardEps", () => {
  const items = [
    { date: "2028-09-27", epsAvg: 10.6 },
    { date: "2027-09-27", epsAvg: 9.6 },
    { date: "2026-09-27", epsAvg: 8.7 },
    { date: "2025-09-27", epsAvg: 7.3 },
  ];

  it("picks FY1 and time-weights FY1/FY2 into a constant NTM horizon", () => {
    const r = selectForwardEps(items, "2026-06-17");
    expect(r?.date).toBe("2026-09-27");
    expect(r?.epsAvg).toBe(8.7);
    // 102 days to FY1 end → w = 102/365; NTM = w·8.7 + (1−w)·9.6.
    expect(r?.ntmEpsAvg).toBeCloseTo(9.3485, 3);
  });

  it("ignores past-dated entries", () => {
    const r = selectForwardEps(items, "2027-01-01");
    expect(r?.date).toBe("2027-09-27");
    expect(r?.epsAvg).toBe(9.6);
    // 269 days to FY1 end → mostly FY1, tail from FY2.
    expect(r?.ntmEpsAvg).toBeCloseTo(9.863, 3);
  });

  it("returns null when all entries are historical", () => {
    expect(selectForwardEps(items, "2030-01-01")).toBeNull();
  });

  it("skips null entries and falls back to FY1 alone when FY2 is absent", () => {
    const mixed = [
      { date: null, epsAvg: 99 },
      { date: "2027-09-27", epsAvg: null },
      { date: "2026-09-27", epsAvg: 8.7 },
    ];
    expect(selectForwardEps(mixed, "2026-01-01")).toEqual({
      date: "2026-09-27",
      epsAvg: 8.7,
      ntmEpsAvg: 8.7,
    });
  });

  it("returns null for an empty list", () => {
    expect(selectForwardEps([], "2026-06-17")).toBeNull();
  });
});

describe("fetchTickerProfileFull", () => {
  it("returns null for empty ticker without calling fetch", async () => {
    const spy = vi.spyOn(global, "fetch");
    expect(await fetchTickerProfileFull("")).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("parses the rich profile, splitting the 52w range", async () => {
    mockFetchResponse([
      {
        symbol: "AAPL",
        companyName: "Apple Inc.",
        isEtf: false,
        price: 299.24,
        marketCap: 4395044409440,
        beta: 1.086,
        lastDividend: 1.05,
        range: "195.07-317.4",
        exchange: "NASDAQ",
        sector: "Technology",
        industry: "Consumer Electronics",
        country: "US",
        ceo: "Timothy D. Cook",
        fullTimeEmployees: "164000",
        ipoDate: "1980-12-12",
        currency: "USD",
      },
    ]);
    const result = await fetchTickerProfileFull("AAPL");
    expect(result).toMatchObject({
      symbol: "AAPL",
      sector: "Technology",
      industry: "Consumer Electronics",
      exchange: "NASDAQ",
      range52wLow: 195.07,
      range52wHigh: 317.4,
      employees: 164000,
      marketCap: 4395044409440,
      beta: 1.086,
    });
  });

  it("returns null when symbol/isEtf are missing", async () => {
    mockFetchResponse([{ symbol: "AAPL" }]);
    expect(await fetchTickerProfileFull("AAPL")).toBeNull();
  });

  it("degrades range to nulls when malformed", async () => {
    mockFetchResponse([{ symbol: "X", isEtf: false, range: "n/a" }]);
    const result = await fetchTickerProfileFull("X");
    expect(result?.range52wLow).toBeNull();
    expect(result?.range52wHigh).toBeNull();
  });
});

describe("fetchRatiosTtm", () => {
  it("maps TTM ratio fields", async () => {
    mockFetchResponse([
      {
        symbol: "AAPL",
        priceToEarningsRatioTTM: 35.9,
        netIncomePerShareTTM: 8.33,
        dividendYieldTTM: 0.0035,
        priceToSalesRatioTTM: 9.7,
        priceToBookRatioTTM: 41.3,
        priceToFreeCashFlowRatioTTM: 34.0,
        enterpriseValueMultipleTTM: 27.7,
        netProfitMarginTTM: 0.2715,
        debtToEquityRatioTTM: 0.795,
      },
    ]);
    const result = await fetchRatiosTtm("AAPL");
    expect(result).toEqual({
      ok: true,
      data: {
        peTtm: 35.9,
        epsTtm: 8.33,
        divYieldTtm: 0.0035,
        psTtm: 9.7,
        pbTtm: 41.3,
        pfcfTtm: 34.0,
        evEbitdaTtm: 27.7,
        netMarginTtm: 0.2715,
        debtToEquityTtm: 0.795,
      },
    });
  });

  it("distinguishes transport failure from an empty payload", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("err", { status: 500 }));
    expect(await fetchRatiosTtm("AAPL")).toEqual({ ok: false });

    vi.restoreAllMocks();
    mockFetchResponse([]);
    expect(await fetchRatiosTtm("AAPL")).toEqual({ ok: true, data: null });
  });
});

describe("fmp.ts purity", () => {
  it("does not import drizzle-orm, @/server/db, or next/cache", async () => {
    const fs = await import("fs");
    const source = fs.readFileSync("src/server/services/fmp.ts", "utf-8");
    expect(source).not.toContain("drizzle-orm");
    expect(source).not.toContain("@/server/db");
    expect(source).not.toContain("next/cache");
    expect(source).not.toContain("revalidatePath");
  });
});

describe("fetchScreenerCompanies", () => {
  const criteria = {
    marketCapMoreThan: 2_000_000_000,
    marketCapLowerThan: null,
    volumeMoreThan: 500_000,
    sector: null,
    limit: 300,
  };

  it("maps screener rows and passes the US floors in the query", async () => {
    mockFetchResponse([
      {
        symbol: "NVDA",
        companyName: "NVIDIA Corporation",
        marketCap: 5005027440000,
        sector: "Technology",
        industry: "Semiconductors",
        price: 206.64,
        volume: 127547828,
        exchange: "NASDAQ Global Select",
        exchangeShortName: "NASDAQ",
        country: "US",
        isEtf: false,
      },
      { companyName: "No symbol — dropped" },
    ]);

    const result = await fetchScreenerCompanies(criteria);
    expect(result).toEqual([
      {
        symbol: "NVDA",
        companyName: "NVIDIA Corporation",
        marketCap: 5005027440000,
        sector: "Technology",
        industry: "Semiconductors",
        price: 206.64,
        volume: 127547828,
        exchangeShortName: "NASDAQ",
      },
    ]);
    const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
    expect(url).toContain("/company-screener?");
    expect(url).toContain("marketCapMoreThan=2000000000");
    expect(url).toContain("volumeMoreThan=500000");
    expect(url).toContain("country=US");
    expect(url).toContain("isActivelyTrading=true");
    expect(url).toContain("isEtf=false");
    expect(url).toContain("limit=300");
    // Band ceiling and sector are omitted when null.
    expect(url).not.toContain("marketCapLowerThan");
    expect(url).not.toContain("sector=");
  });

  it("passes the mcap ceiling and sector when set", async () => {
    mockFetchResponse([]);
    await fetchScreenerCompanies({
      ...criteria,
      marketCapLowerThan: 30_000_000_000,
      sector: "Financial Services",
    });
    const url = vi.mocked(global.fetch).mock.calls[0][0] as string;
    expect(url).toContain("marketCapLowerThan=30000000000");
    expect(url).toContain("sector=Financial+Services");
  });

  it("returns empty array on failure or non-array payload", async () => {
    mockFetchResponse({ error: "nope" });
    expect(await fetchScreenerCompanies(criteria)).toEqual([]);

    vi.restoreAllMocks();
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("boom"));
    expect(await fetchScreenerCompanies(criteria)).toEqual([]);
  });
});

describe("fetchPriceChange", () => {
  it("maps the numeric-keyed windows", async () => {
    mockFetchResponse([
      { symbol: "AAPL", "1D": -1.77, "1M": -2.95, "3M": 9.6, "6M": 9.73, "1Y": 49.21 },
    ]);
    const result = await fetchPriceChange("AAPL");
    expect(result).toEqual({
      ok: true,
      data: {
        change1m: -2.95,
        change3m: 9.6,
        change6m: 9.73,
        change1y: 49.21,
      },
    });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/stock-price-change?symbol=AAPL")
    );
  });

  it("nulls missing windows and reports empty payloads as ok-but-absent", async () => {
    mockFetchResponse([{ symbol: "NEWIPO", "1M": 4.2 }]);
    const partial = await fetchPriceChange("NEWIPO");
    expect(partial).toEqual({
      ok: true,
      data: {
        change1m: 4.2,
        change3m: null,
        change6m: null,
        change1y: null,
      },
    });

    vi.restoreAllMocks();
    mockFetchResponse([]);
    expect(await fetchPriceChange("AAPL")).toEqual({ ok: true, data: null });
  });
});
