import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchStockPrices, fetchFxRates } from "./fmp";

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

  it("fetches a single ticker", async () => {
    const quote = { symbol: "AAPL", price: 258.86, volume: 29319825 };
    mockFetchResponse([quote]);

    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([quote]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/quote-short/AAPL?apikey=test-api-key")
    );
  });

  it("fetches multiple tickers in parallel", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      if (urlStr.includes("AAPL")) {
        return new Response(
          JSON.stringify([{ symbol: "AAPL", price: 258.86, volume: 100 }])
        );
      }
      return new Response(
        JSON.stringify([{ symbol: "MSFT", price: 410.5, volume: 200 }])
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
    mockFetchResponse([{ symbol: "AAPL" }, { symbol: "MSFT", price: 410.5, volume: 200 }]);
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([{ symbol: "MSFT", price: 410.5, volume: 200 }]);
  });

  it("filters out items with NaN or Infinity price", async () => {
    mockFetchResponse([
      { symbol: "BAD1", price: NaN, volume: 0 },
      { symbol: "BAD2", price: Infinity, volume: 0 },
      { symbol: "GOOD", price: 100, volume: 50 },
    ]);
    const result = await fetchStockPrices(["AAPL"]);
    expect(result).toEqual([{ symbol: "GOOD", price: 100, volume: 50 }]);
  });

  it("handles partial failures gracefully", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      if (urlStr.includes("AAPL")) {
        return new Response(
          JSON.stringify([{ symbol: "AAPL", price: 258.86, volume: 100 }])
        );
      }
      return new Response("error", { status: 500 });
    });

    const result = await fetchStockPrices(["AAPL", "INVALID"]);
    expect(result).toEqual([{ symbol: "AAPL", price: 258.86, volume: 100 }]);
  });
});

describe("fetchFxRates", () => {
  it("returns empty array for empty currencies", async () => {
    const spy = vi.spyOn(global, "fetch");
    const result = await fetchFxRates([]);
    expect(result).toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it("fetches a single FX rate with correct pair format", async () => {
    const fxQuote = { symbol: "GBPUSD", price: 1.32344, volume: 71487 };
    mockFetchResponse([fxQuote]);

    const result = await fetchFxRates(["GBP"]);
    expect(result).toEqual([fxQuote]);
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/forex-quote-short/GBPUSD?apikey=test-api-key")
    );
  });

  it("fetches multiple FX rates in parallel", async () => {
    vi.spyOn(global, "fetch").mockImplementation(async (url) => {
      const urlStr = url instanceof Request ? url.url : url.toString();
      if (urlStr.includes("GBPUSD")) {
        return new Response(
          JSON.stringify([{ symbol: "GBPUSD", price: 1.32, volume: 100 }])
        );
      }
      return new Response(
        JSON.stringify([{ symbol: "EURUSD", price: 1.08, volume: 200 }])
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
