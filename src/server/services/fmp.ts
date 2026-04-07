import { config } from "@/server/config";
import type { FmpQuote, FmpFxQuote } from "@/server/types/market-data";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";

/**
 * Fetch stock quotes for given tickers via FMP /quote endpoint.
 * Returns full quote data including timestamp (for actual trading date).
 * Pure function — no DB or framework imports.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchStockPrices(tickers: string[]): Promise<FmpQuote[]> {
  if (tickers.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const results = await Promise.all(
    tickers.map((ticker) => fetchQuote(ticker))
  );

  return results.flat();
}

/**
 * Fetch FX rates for given non-USD currencies via FMP /quote endpoint.
 * Currencies should be base currencies (e.g., "GBP", "EUR") — "USD" is appended automatically.
 * Pure function — no DB or framework imports.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchFxRates(currencies: string[]): Promise<FmpFxQuote[]> {
  if (currencies.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const results = await Promise.all(
    currencies.map((currency) => fetchForexQuote(`${currency}USD`))
  );

  return results.flat();
}

function isValidQuote(item: unknown): item is FmpQuote {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FmpQuote).symbol === "string" &&
    typeof (item as FmpQuote).price === "number" &&
    Number.isFinite((item as FmpQuote).price) &&
    typeof (item as FmpQuote).timestamp === "number" &&
    Number.isFinite((item as FmpQuote).timestamp)
  );
}

async function fetchQuote(symbol: string): Promise<FmpQuote[]> {
  try {
    const url = `${FMP_BASE_URL}/quote?symbol=${encodeURIComponent(symbol)}&apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isValidQuote);
  } catch {
    return [];
  }
}

async function fetchForexQuote(pair: string): Promise<FmpFxQuote[]> {
  try {
    const url = `${FMP_BASE_URL}/quote?symbol=${encodeURIComponent(pair)}&apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isValidQuote) as FmpFxQuote[];
  } catch {
    return [];
  }
}
