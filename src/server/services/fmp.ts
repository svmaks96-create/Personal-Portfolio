import { config } from "@/server/config";
import { subDays, format } from "date-fns";
import type { FmpEodQuote } from "@/server/types/market-data";
import type { FmpCompanyProfile, FmpEtfHolding, FmpExchangeVariant } from "@/server/types/concentration";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const EOD_LOOKBACK_DAYS = 7;

/** Benchmark ETF tickers fetched alongside user holdings for performance comparison. */
export const BENCHMARK_TICKERS = ["SPY", "QQQ"] as const;

/**
 * Fetch official closing prices for given tickers via FMP EOD light endpoint.
 * Defaults to the last 7 days. Pass `fromDate` (yyyy-MM-dd) to fetch full history
 * starting from a specific date — used by the backfill action.
 * Pure function — no DB or framework imports.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchStockPrices(
  tickers: string[],
  fromDate?: string
): Promise<FmpEodQuote[]> {
  if (tickers.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const from = fromDate ?? format(subDays(new Date(), EOD_LOOKBACK_DAYS), "yyyy-MM-dd");
  const results = await Promise.all(
    tickers.map((ticker) => fetchEodLight(ticker, from))
  );

  return results.flat();
}

/**
 * Fetch official closing FX rates for given non-USD currencies via FMP EOD light endpoint.
 * Currencies should be base currencies (e.g., "GBP", "EUR") — "USD" is appended automatically.
 * Defaults to the last 7 days. Pass `fromDate` (yyyy-MM-dd) for full history backfill.
 * Pure function — no DB or framework imports.
 * Returns empty array on empty input or missing API key.
 */
export async function fetchFxRates(
  currencies: string[],
  fromDate?: string
): Promise<FmpEodQuote[]> {
  if (currencies.length === 0) return [];
  if (!config.fmpApiKey) return [];

  const from = fromDate ?? format(subDays(new Date(), EOD_LOOKBACK_DAYS), "yyyy-MM-dd");
  const results = await Promise.all(
    currencies.map((currency) => fetchEodLight(`${currency}USD`, from))
  );

  return results.flat();
}

function isValidEodQuote(item: unknown): item is FmpEodQuote {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as FmpEodQuote).symbol === "string" &&
    typeof (item as FmpEodQuote).date === "string" &&
    (item as FmpEodQuote).date.length === 10 &&
    typeof (item as FmpEodQuote).price === "number" &&
    Number.isFinite((item as FmpEodQuote).price)
  );
}

async function fetchEodLight(symbol: string, from: string): Promise<FmpEodQuote[]> {
  try {
    const url = `${FMP_BASE_URL}/historical-price-eod/light?symbol=${encodeURIComponent(symbol)}&from=${from}&apikey=${config.fmpApiKey}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter(isValidEodQuote);
  } catch {
    return [];
  }
}

/**
 * Fetch a single company profile from FMP /profile.
 * Returns `{ symbol, companyName, isEtf }` or null on failure.
 */
export async function fetchCompanyProfile(
  ticker: string
): Promise<FmpCompanyProfile | null> {
  if (!ticker) return null;
  if (!config.fmpApiKey) return null;
  return fetchProfile(ticker);
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

interface RawProfile {
  symbol: string;
  companyName?: unknown;
  isEtf: boolean;
}

function isValidProfile(item: unknown): item is RawProfile {
  return (
    typeof item === "object" &&
    item !== null &&
    typeof (item as RawProfile).symbol === "string" &&
    typeof (item as RawProfile).isEtf === "boolean"
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
    const companyName =
      typeof item.companyName === "string" && item.companyName.length > 0
        ? item.companyName
        : null;
    return { symbol: item.symbol, companyName, isEtf: item.isEtf };
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
