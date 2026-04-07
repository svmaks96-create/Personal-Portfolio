import { config } from "@/server/config";
import type { FmpQuote, FmpFxQuote } from "@/server/types/market-data";

const FMP_BASE_URL = "https://financialmodelingprep.com/api/v3";

/**
 * Fetch stock prices for given tickers via FMP quote-short endpoint.
 * Pure function — no DB or framework imports.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchStockPrices(tickers: string[]): Promise<FmpQuote[]> {
  if (tickers.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const results = await Promise.all(
    tickers.map((ticker) => fetchQuoteShort(ticker))
  );

  return results.flat();
}

/**
 * Fetch FX rates for given non-USD currencies via FMP forex-quote-short endpoint.
 * Currencies should be base currencies (e.g., "GBP", "EUR") — "USD" is appended automatically.
 * Pure function — no DB or framework imports.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchFxRates(currencies: string[]): Promise<FmpFxQuote[]> {
  if (currencies.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const results = await Promise.all(
    currencies.map((currency) => fetchForexQuoteShort(`${currency}USD`))
  );

  return results.flat();
}

async function fetchQuoteShort(symbol: string): Promise<FmpQuote[]> {
  try {
    const url = `${FMP_BASE_URL}/quote-short/${encodeURIComponent(symbol)}?apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data as FmpQuote[];
  } catch {
    return [];
  }
}

async function fetchForexQuoteShort(pair: string): Promise<FmpFxQuote[]> {
  try {
    const url = `${FMP_BASE_URL}/forex-quote-short/${encodeURIComponent(pair)}?apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data as FmpFxQuote[];
  } catch {
    return [];
  }
}
