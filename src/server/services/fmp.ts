import { config } from "@/server/config";
import { subDays, format, parseISO, differenceInCalendarDays } from "date-fns";
import type { FmpEodQuote } from "@/server/types/market-data";
import type { FmpCompanyProfile, FmpEtfHolding, FmpExchangeVariant } from "@/server/types/concentration";
import type {
  FmpProfileFull,
  FmpRatiosTtm,
  FmpKeyMetricsTtm,
  FmpForwardEps,
  FmpPriceTargetConsensus,
  FmpRatingSnapshot,
  FmpDividendEvent,
} from "@/server/types/fundamentals";

const FMP_BASE_URL = "https://financialmodelingprep.com/stable";
const EOD_LOOKBACK_DAYS = 7;

// ---------------------------------------------------------------------------
// Rate limiting — ALL FMP traffic flows through fmpFetch, so overlapping
// operations (a screening run + a fundamentals refresh) share one budget and
// cannot jointly breach the plan cap. Concurrency elsewhere only bounds
// connections; THIS is what bounds calls per minute.
// ---------------------------------------------------------------------------

/** Sliding-window cap, ~17% headroom under the Ultimate plan's 3,000/min. */
const FMP_CALLS_PER_MINUTE = 2_500;
const RATE_WINDOW_MS = 60_000;
const recentCallTimes: number[] = [];

async function fmpFetch(url: string): Promise<Response> {
  for (;;) {
    const now = Date.now();
    while (recentCallTimes.length > 0 && now - recentCallTimes[0] >= RATE_WINDOW_MS) {
      recentCallTimes.shift();
    }
    if (recentCallTimes.length < FMP_CALLS_PER_MINUTE) {
      recentCallTimes.push(now);
      break;
    }
    // Window full — sleep until the oldest call ages out, then re-check.
    const waitMs = RATE_WINDOW_MS - (now - recentCallTimes[0]) + 5;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  return fetch(url);
}

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
    const response = await fmpFetch(url);
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
    const response = await fmpFetch(url);
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
    const response = await fmpFetch(url);
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
    const response = await fmpFetch(url);
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

// ---------------------------------------------------------------------------
// Fundamentals (company research data for the position detail page)
// ---------------------------------------------------------------------------

/** Coerce an unknown JSON value to a finite number, else null. */
function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Coerce an unknown JSON value to a non-empty string, else null. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Parse FMP's "low-high" 52-week range string (e.g. "195.07-317.4"). */
function parseRange(value: unknown): [number | null, number | null] {
  if (typeof value !== "string") return [null, null];
  const parts = value.split("-");
  if (parts.length !== 2) return [null, null];
  const low = Number.parseFloat(parts[0]);
  const high = Number.parseFloat(parts[1]);
  return [Number.isFinite(low) ? low : null, Number.isFinite(high) ? high : null];
}

/** FMP returns fullTimeEmployees as a string; parse to an integer. */
function parseEmployees(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") {
    const n = Number.parseInt(value.replace(/[^0-9]/g, ""), 10);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Fetch a single-object FMP endpoint (array-wrapped) and return the first item
 * as a plain record, or null. `path` must already include `?symbol=...`.
 */
async function fetchFirstObject(
  path: string
): Promise<Record<string, unknown> | null> {
  const result = await fetchFirstObjectResult(path);
  return result.ok ? result.item : null;
}

/**
 * Discriminated fetch outcome: `ok: true` means the endpoint answered (data
 * may still be legitimately absent); `ok: false` means transport/HTTP failure
 * — the caller CANNOT tell what the data would have been. Screening uses this
 * to keep rate-limit errors from masquerading as missing metrics.
 */
export type FmpResult<T> = { ok: true; data: T | null } | { ok: false };

/**
 * Like fetchFirstObject but distinguishes "endpoint answered with no rows"
 * (ok, item null) from HTTP/network failure (not ok).
 */
async function fetchFirstObjectResult(
  path: string
): Promise<{ ok: true; item: Record<string, unknown> | null } | { ok: false }> {
  try {
    const url = `${FMP_BASE_URL}/${path}&apikey=${config.fmpApiKey}`;
    const response = await fmpFetch(url);
    if (!response.ok) return { ok: false };
    const data = await response.json();
    // Non-array payloads are FMP error envelopes, not empty results.
    if (!Array.isArray(data)) return { ok: false };
    const item = data[0];
    return {
      ok: true,
      item:
        typeof item === "object" && item !== null
          ? (item as Record<string, unknown>)
          : null,
    };
  } catch {
    return { ok: false };
  }
}

/**
 * Fetch the rich FMP /profile shape (superset of fetchCompanyProfile's
 * name/isEtf contract). Returns null on missing key / failure.
 */
export async function fetchTickerProfileFull(
  ticker: string
): Promise<FmpProfileFull | null> {
  if (!ticker || !config.fmpApiKey) return null;
  const p = await fetchFirstObject(`profile?symbol=${encodeURIComponent(ticker)}`);
  if (!p || typeof p.symbol !== "string" || typeof p.isEtf !== "boolean") return null;
  const [low, high] = parseRange(p.range);
  return {
    symbol: p.symbol,
    companyName: str(p.companyName),
    isEtf: p.isEtf,
    price: num(p.price),
    marketCap: num(p.marketCap),
    beta: num(p.beta),
    lastDividend: num(p.lastDividend),
    range52wLow: low,
    range52wHigh: high,
    exchange: str(p.exchange),
    exchangeFullName: str(p.exchangeFullName),
    sector: str(p.sector),
    industry: str(p.industry),
    country: str(p.country),
    ceo: str(p.ceo),
    employees: parseEmployees(p.fullTimeEmployees),
    ipoDate: str(p.ipoDate),
    description: str(p.description),
    website: str(p.website),
    currency: str(p.currency),
  };
}

/** Fetch TTM ratios (FMP /ratios-ttm). Not-ok = transport failure, retryable. */
export async function fetchRatiosTtm(
  ticker: string
): Promise<FmpResult<FmpRatiosTtm>> {
  if (!ticker || !config.fmpApiKey) return { ok: false };
  const result = await fetchFirstObjectResult(
    `ratios-ttm?symbol=${encodeURIComponent(ticker)}`
  );
  if (!result.ok) return { ok: false };
  const r = result.item;
  if (!r) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      peTtm: num(r.priceToEarningsRatioTTM),
      epsTtm: num(r.netIncomePerShareTTM),
      divYieldTtm: num(r.dividendYieldTTM),
      psTtm: num(r.priceToSalesRatioTTM),
      pbTtm: num(r.priceToBookRatioTTM),
      pfcfTtm: num(r.priceToFreeCashFlowRatioTTM),
      evEbitdaTtm: num(r.enterpriseValueMultipleTTM),
      netMarginTtm: num(r.netProfitMarginTTM),
      debtToEquityTtm: num(r.debtToEquityRatioTTM),
    },
  };
}

/** Fetch ROE / ROIC / income quality TTM (FMP /key-metrics-ttm, one call). */
export async function fetchKeyMetricsTtm(
  ticker: string
): Promise<FmpResult<FmpKeyMetricsTtm>> {
  if (!ticker || !config.fmpApiKey) return { ok: false };
  const result = await fetchFirstObjectResult(
    `key-metrics-ttm?symbol=${encodeURIComponent(ticker)}`
  );
  if (!result.ok) return { ok: false };
  const m = result.item;
  if (!m) return { ok: true, data: null };
  return {
    ok: true,
    data: {
      roeTtm: num(m.returnOnEquityTTM),
      roicTtm: num(m.returnOnInvestedCapitalTTM),
      incomeQualityTtm: num(m.incomeQualityTTM),
    },
  };
}

/**
 * Pick FY1 (nearest fiscal-year end strictly after `todayIso`) and build the
 * NTM (next-twelve-months) EPS by time-weighting FY1 with FY2: FY1 covers the
 * next `w` fraction of the year, FY2 the remainder. Without FY2, FY1 stands
 * alone. This keeps the growth horizon CONSTANT across companies whose fiscal
 * years end 1 vs 11 months out. Pure — exported for testing.
 */
export function selectForwardEps(
  items: { date: string | null; epsAvg: number | null }[],
  todayIso: string
): FmpForwardEps | null {
  const future = items
    .filter(
      (d): d is { date: string; epsAvg: number } =>
        d.date !== null && d.epsAvg !== null && d.date > todayIso
    )
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const fy1 = future[0];
  if (!fy1) return null;
  const fy2 = future[1];

  const daysToFy1 = differenceInCalendarDays(
    parseISO(fy1.date),
    parseISO(todayIso)
  );
  const w = Math.min(1, Math.max(0, daysToFy1 / 365));
  const ntmEpsAvg =
    fy2 === undefined ? fy1.epsAvg : w * fy1.epsAvg + (1 - w) * fy2.epsAvg;

  return { date: fy1.date, epsAvg: fy1.epsAvg, ntmEpsAvg };
}

/** Fetch the nearest upcoming fiscal-year EPS estimate (FMP /analyst-estimates). */
export async function fetchForwardEps(
  ticker: string,
  todayIso: string
): Promise<FmpResult<FmpForwardEps>> {
  if (!ticker || !config.fmpApiKey) return { ok: false };
  try {
    const url = `${FMP_BASE_URL}/analyst-estimates?symbol=${encodeURIComponent(ticker)}&period=annual&limit=20&apikey=${config.fmpApiKey}`;
    const response = await fmpFetch(url);
    if (!response.ok) return { ok: false };
    const data = await response.json();
    if (!Array.isArray(data)) return { ok: false };
    const items = data.map((d) => {
      const o = d as Record<string, unknown>;
      return { date: str(o.date), epsAvg: num(o.epsAvg) };
    });
    return { ok: true, data: selectForwardEps(items, todayIso) };
  } catch {
    return { ok: false };
  }
}

/** Fetch analyst price-target consensus (FMP /price-target-consensus). */
export async function fetchPriceTargetConsensus(
  ticker: string
): Promise<FmpPriceTargetConsensus | null> {
  if (!ticker || !config.fmpApiKey) return null;
  const t = await fetchFirstObject(
    `price-target-consensus?symbol=${encodeURIComponent(ticker)}`
  );
  if (!t) return null;
  return {
    targetHigh: num(t.targetHigh),
    targetLow: num(t.targetLow),
    targetMedian: num(t.targetMedian),
    targetConsensus: num(t.targetConsensus),
  };
}

/** Fetch the analyst rating snapshot (FMP /ratings-snapshot). */
export async function fetchRatingSnapshot(
  ticker: string
): Promise<FmpRatingSnapshot | null> {
  if (!ticker || !config.fmpApiKey) return null;
  const r = await fetchFirstObject(
    `ratings-snapshot?symbol=${encodeURIComponent(ticker)}`
  );
  if (!r) return null;
  return { rating: str(r.rating), overallScore: num(r.overallScore) };
}

/** Fetch recent dividend events (FMP /dividends), newest first. */
export async function fetchDividendHistory(
  ticker: string,
  limit = 12
): Promise<FmpDividendEvent[]> {
  if (!ticker || !config.fmpApiKey) return [];
  try {
    const url = `${FMP_BASE_URL}/dividends?symbol=${encodeURIComponent(ticker)}&limit=${limit}&apikey=${config.fmpApiKey}`;
    const response = await fmpFetch(url);
    if (!response.ok) return [];
    const data = await response.json();
    if (!Array.isArray(data)) return [];
    const out: FmpDividendEvent[] = [];
    for (const d of data) {
      const o = d as Record<string, unknown>;
      const exDate = str(o.date);
      const dividend = num(o.dividend);
      if (exDate === null || dividend === null) continue;
      out.push({
        exDate,
        paymentDate: str(o.paymentDate),
        dividend,
        yield: num(o.yield),
        frequency: str(o.frequency),
      });
    }
    return out;
  } catch {
    return [];
  }
}
