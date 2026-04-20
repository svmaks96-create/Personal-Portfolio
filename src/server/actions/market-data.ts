"use server";

import { revalidatePath } from "next/cache";
import { differenceInDays, parseISO } from "date-fns";
import { db } from "@/server/db";
import {
  transactions,
  etfHoldings,
  tickerVariants,
  tickerProfiles,
} from "@/server/db/schema";
import { upsertMarketDataRows } from "@/server/db/market-data-writer";
import {
  fetchStockPrices,
  fetchFxRates,
  fetchCompanyProfile,
  fetchEtfHoldings,
  fetchExchangeVariants,
  BENCHMARK_TICKERS,
} from "@/server/services/fmp";
import { getEarliestTransactionDate } from "@/server/queries/market-data";
import { getEtfHoldingsFetchedAt, getVariantsFetchedAt } from "@/server/queries/etf-holdings";
import {
  getTickerProfilesMap,
  getTickerProfileFetchedAt,
} from "@/server/queries/ticker-profiles";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/server/types/action-result";
import type {
  RefreshResult,
  BackfillResult,
  FmpEodQuote,
} from "@/server/types/market-data";

/**
 * Refresh stock prices for all unique tickers in the transactions table plus
 * benchmark ETFs (SPY, QQQ). Writes every daily row returned by FMP — older
 * dates are preserved in `market_data` so TWRR can chain through them.
 */
export async function refreshPrices(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique tickers from transactions, union benchmarks
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const heldTickers = new Set(rows.map((r) => r.ticker));
    const allTickers = [...new Set([...heldTickers, ...BENCHMARK_TICKERS])];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Fetch closing prices via FMP EOD light endpoint (default 7-day window).
    const quotes = await fetchStockPrices(allTickers);

    if (quotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch stock prices. Please try again.",
      };
    }

    // 3. Write every (symbol, date) returned, upserting on conflict.
    const fetchedAt = new Date().toISOString();
    const symbolsTouched = upsertMarketDataRows(quotes, "stock_price", fetchedAt);

    revalidatePath("/", "layout");

    return {
      success: true,
      data: { updated: symbolsTouched, skipped: allTickers.length - symbolsTouched },
    };
  } catch (error) {
    console.error("refreshPrices failed:", error);
    return {
      success: false,
      error: "Unable to fetch stock prices. Please try again.",
    };
  }
}

/**
 * Refresh FX rates for all unique non-USD currencies in the transactions table.
 * Writes every daily row returned by FMP — older dates are preserved so TWRR
 * can value historical positions in USD.
 */
export async function refreshFxRates(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique non-USD currencies from transactions
    const rows = db.select({ currency: transactions.currency }).from(transactions).all();
    const allCurrencies = [...new Set(rows.map((r) => r.currency))].filter(
      (c) => c !== "USD"
    );

    if (allCurrencies.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Fetch closing FX rates via FMP EOD light endpoint (default 7-day window).
    const fxQuotes = await fetchFxRates(allCurrencies);

    if (fxQuotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch FX rates. Please try again.",
      };
    }

    // 3. Write every (symbol, date) returned.
    const fetchedAt = new Date().toISOString();
    const symbolsTouched = upsertMarketDataRows(fxQuotes, "fx_rate", fetchedAt);

    revalidatePath("/", "layout");

    return {
      success: true,
      data: { updated: symbolsTouched, skipped: allCurrencies.length - symbolsTouched },
    };
  } catch (error) {
    console.error("refreshFxRates failed:", error);
    return {
      success: false,
      error: "Unable to fetch FX rates. Please try again.",
    };
  }
}

const BACKFILL_CONCURRENCY = 10;

/**
 * Run an async fetcher across `items` with bounded concurrency.
 * Uses Promise.allSettled per chunk so a single failure doesn't drop the rest.
 * Failed items (rejection or empty result) are reported in `failed`.
 */
async function fetchInChunks<T extends string>(
  items: T[],
  fetcher: (item: T) => Promise<FmpEodQuote[]>,
  concurrency: number
): Promise<{ rows: FmpEodQuote[]; failed: T[] }> {
  const allRows: FmpEodQuote[] = [];
  const failed: T[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((item) => fetcher(item)));
    for (let j = 0; j < settled.length; j++) {
      const result = settled[j];
      const item = chunk[j];
      if (result.status === "fulfilled" && result.value.length > 0) {
        allRows.push(...result.value);
      } else {
        failed.push(item);
      }
    }
  }

  return { rows: allRows, failed };
}

/**
 * One-time-use backfill: fetches the full daily price history for every held
 * ticker, the benchmark ETFs (SPY, QQQ), and every non-USD FX pair, starting
 * from the earliest transaction date. Idempotent: re-running upserts the same
 * (symbol, date) rows. Required to power TWRR / benchmark comparison.
 */
export async function backfillHistory(): Promise<ActionResult<BackfillResult>> {
  try {
    const earliestDate = getEarliestTransactionDate();
    if (earliestDate === null) {
      return {
        success: false,
        error: "No transactions found. Import data before backfilling.",
      };
    }

    const txRows = db
      .select({ ticker: transactions.ticker, currency: transactions.currency })
      .from(transactions)
      .all();

    const heldTickers = new Set(txRows.map((r) => r.ticker));
    const tickerSymbols = [...new Set([...heldTickers, ...BENCHMARK_TICKERS])];
    const fxCurrencies = [...new Set(txRows.map((r) => r.currency))].filter(
      (c) => c !== "USD"
    );

    const fetchedAt = new Date().toISOString();

    const stockResult = await fetchInChunks(
      tickerSymbols,
      (ticker) => fetchStockPrices([ticker], earliestDate),
      BACKFILL_CONCURRENCY
    );

    const fxResult = await fetchInChunks(
      fxCurrencies,
      (currency) => fetchFxRates([currency], earliestDate),
      BACKFILL_CONCURRENCY
    );

    const stockRowsWritten = stockResult.rows.length;
    const fxRowsWritten = fxResult.rows.length;

    upsertMarketDataRows(stockResult.rows, "stock_price", fetchedAt);
    upsertMarketDataRows(fxResult.rows, "fx_rate", fetchedAt);

    revalidatePath("/", "layout");

    const symbolsAttempted = tickerSymbols.length + fxCurrencies.length;
    const symbolsFailed = [
      ...stockResult.failed,
      ...fxResult.failed.map((c) => `${c}USD`),
    ];
    const symbolsSucceeded = symbolsAttempted - symbolsFailed.length;

    return {
      success: true,
      data: {
        symbolsAttempted,
        symbolsSucceeded,
        symbolsFailed,
        rowsWritten: stockRowsWritten + fxRowsWritten,
        earliestDate,
      },
    };
  } catch (error) {
    console.error("backfillHistory failed:", error);
    return {
      success: false,
      error: "Backfill failed. Please try again.",
    };
  }
}

const TICKER_PROFILE_STALENESS_DAYS = 30;
const ETF_HOLDINGS_STALENESS_DAYS = 7;

/**
 * Refresh company-name + isEtf metadata for all unique tickers in transactions.
 * Reads from the `ticker_profiles` table and only calls FMP /profile for tickers
 * whose cached profile is missing or older than TICKER_PROFILE_STALENESS_DAYS.
 * Names and ETF status change very rarely, so the staleness window is long.
 */
export async function refreshTickerProfiles(): Promise<ActionResult<RefreshResult>> {
  try {
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    const now = new Date();
    let updated = 0;
    let skipped = 0;

    for (const ticker of allTickers) {
      const fetchedAt = getTickerProfileFetchedAt(ticker);
      if (fetchedAt !== null) {
        const daysSinceFetch = differenceInDays(now, parseISO(fetchedAt));
        if (daysSinceFetch < TICKER_PROFILE_STALENESS_DAYS) {
          skipped++;
          continue;
        }
      }

      const profile = await fetchCompanyProfile(ticker);
      if (profile === null) {
        skipped++;
        continue;
      }

      const fetchedAtStr = now.toISOString();
      db.transaction((tx) => {
        tx.delete(tickerProfiles).where(eq(tickerProfiles.ticker, ticker)).run();
        tx.insert(tickerProfiles)
          .values({
            ticker,
            name: profile.companyName,
            isEtf: profile.isEtf,
            fetchedAt: fetchedAtStr,
          })
          .run();
      });
      updated++;
    }

    revalidatePath("/", "layout");

    return { success: true, data: { updated, skipped } };
  } catch (error) {
    console.error("refreshTickerProfiles failed:", error);
    return {
      success: false,
      error: "Unable to fetch ticker profiles. Please try again.",
    };
  }
}

/**
 * Refresh ETF holdings for all ETF tickers in the transactions table.
 * Reads isEtf from the ticker_profiles table, then fetches holdings for
 * stale/missing ETFs. Holdings are considered stale after 7 days.
 */
export async function refreshEtfHoldings(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique tickers from transactions
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Split tickers by ETF status from the cached ticker_profiles table.
    // Tickers missing from the cache are skipped — refreshTickerProfiles will
    // populate them on the next run.
    const profilesMap = getTickerProfilesMap();
    const etfTickers = allTickers.filter((t) => profilesMap[t]?.isEtf === true);
    const stockTickers = allTickers.filter((t) => profilesMap[t]?.isEtf === false);

    const now = new Date();
    let updated = 0;
    let skipped = 0;

    // 3. Fetch exchange variants for non-ETF tickers (ADR ↔ local share mappings)
    for (const ticker of stockTickers) {
      const fetchedAt = getVariantsFetchedAt(ticker);

      if (fetchedAt !== null) {
        const daysSinceFetch = differenceInDays(now, parseISO(fetchedAt));
        if (daysSinceFetch < ETF_HOLDINGS_STALENESS_DAYS) {
          continue;
        }
      }

      const variants = await fetchExchangeVariants(ticker);

      if (variants.length <= 1) continue; // Only the ticker itself, no variants

      const fetchedAtStr = now.toISOString();
      db.transaction((tx) => {
        tx.delete(tickerVariants)
          .where(eq(tickerVariants.ticker, ticker))
          .run();

        for (const variant of variants) {
          tx.insert(tickerVariants)
            .values({
              ticker,
              variant: variant.symbol,
              fetchedAt: fetchedAtStr,
            })
            .onConflictDoNothing()
            .run();
        }
      });
    }

    // 4. Check staleness and fetch holdings for stale/missing ETFs
    for (const etfSymbol of etfTickers) {
      const fetchedAt = getEtfHoldingsFetchedAt(etfSymbol);

      if (fetchedAt !== null) {
        const daysSinceFetch = differenceInDays(now, parseISO(fetchedAt));
        if (daysSinceFetch < ETF_HOLDINGS_STALENESS_DAYS) {
          skipped++;
          continue;
        }
      }

      const holdings = await fetchEtfHoldings(etfSymbol);

      if (holdings.length === 0) {
        skipped++;
        continue;
      }

      const fetchedAtStr = now.toISOString();
      db.transaction((tx) => {
        // Delete existing holdings for this ETF
        tx.delete(etfHoldings)
          .where(eq(etfHoldings.etfSymbol, etfSymbol))
          .run();

        // Insert new holdings
        for (const holding of holdings) {
          tx.insert(etfHoldings)
            .values({
              etfSymbol,
              asset: holding.asset,
              weightPercentage: holding.weightPercentage,
              name: holding.name,
              fetchedAt: fetchedAtStr,
            })
            .run();
        }
      });

      updated++;
    }

    // 5. Revalidate
    revalidatePath("/", "layout");

    return {
      success: true,
      data: { updated, skipped },
    };
  } catch (error) {
    console.error("refreshEtfHoldings failed:", error);
    return {
      success: false,
      error: "Unable to fetch ETF holdings. Please try again.",
    };
  }
}
