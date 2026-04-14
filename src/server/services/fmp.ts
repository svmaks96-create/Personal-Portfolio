import { config } from "@/server/config";
import type { FmpQuote, FmpFxQuote } from "@/server/types/market-data";
import type { FmpCompanyProfile, FmpEtfHolding, FmpExchangeVariant } from "@/server/types/concentration";

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
    Number.isFinite((item as FmpQuote).timestamp) &&
    (item as FmpQuote).timestamp > 0
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

/**
 * Fetch company profiles for given tickers to detect ETFs.
 * Uses FMP /profile endpoint — each response has an `isEtf` boolean.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchCompanyProfiles(
  tickers: string[]
): Promise<FmpCompanyProfile[]> {
  if (tickers.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const results = await Promise.all(
    tickers.map((ticker) => fetchProfile(ticker))
  );

  return results.filter(
    (r): r is FmpCompanyProfile => r !== null
  );
}

/**
 * Fetch ETF holdings for a single ETF symbol.
 * Uses FMP /etf-holdings endpoint.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchEtfHoldings(
  etfSymbol: string
): Promise<FmpEtfHolding[]> {
  if (!etfSymbol) return [];
  if (!config.fmpApiKey) return [];

  try {
    const url = `${FMP_BASE_URL}/etf/holdings?symbol=${encodeURIComponent(etfSymbol)}&apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isValidEtfHolding);
  } catch {
    return [];
  }
}

function isValidProfile(item: unknown): item is FmpCompanyProfile {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FmpCompanyProfile).symbol === "string" &&
    typeof (item as FmpCompanyProfile).isEtf === "boolean"
  );
}

async function fetchProfile(symbol: string): Promise<FmpCompanyProfile | null> {
  try {
    const url = `${FMP_BASE_URL}/profile?symbol=${encodeURIComponent(symbol)}&apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;
    const item = data[0];
    if (!isValidProfile(item)) return null;
    return { symbol: item.symbol, isEtf: item.isEtf };
  } catch {
    return null;
  }
}

/**
 * Fetch all exchange variants (cross-listed tickers) for a given symbol.
 * Uses FMP /search-exchange-variants endpoint.
 * Returns all variant symbols for the same company (e.g., TSM → [TSM, 2330.TW, TSFA.F]).
 */
export async function fetchExchangeVariants(
  ticker: string
): Promise<FmpExchangeVariant[]> {
  if (!ticker) return [];
  if (!config.fmpApiKey) return [];

  try {
    const url = `${FMP_BASE_URL}/search-exchange-variants?symbol=${encodeURIComponent(ticker)}&apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isValidExchangeVariant);
  } catch {
    return [];
  }
}

function isValidExchangeVariant(item: unknown): item is FmpExchangeVariant {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FmpExchangeVariant).symbol === "string" &&
    (item as FmpExchangeVariant).symbol.length > 0
  );
}

function isValidEtfHolding(item: unknown): item is FmpEtfHolding {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FmpEtfHolding).asset === "string" &&
    (item as FmpEtfHolding).asset.length > 0 &&
    typeof (item as FmpEtfHolding).weightPercentage === "number" &&
    Number.isFinite((item as FmpEtfHolding).weightPercentage)
  );
}
