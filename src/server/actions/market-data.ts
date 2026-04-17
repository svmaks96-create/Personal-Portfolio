"use server";

import { revalidatePath } from "next/cache";
import { differenceInDays, parseISO } from "date-fns";
import { db } from "@/server/db";
import {
  transactions,
  marketData,
  etfHoldings,
  tickerVariants,
  tickerProfiles,
} from "@/server/db/schema";
import {
  fetchStockPrices,
  fetchFxRates,
  fetchCompanyProfile,
  fetchEtfHoldings,
  fetchExchangeVariants,
} from "@/server/services/fmp";
import { getEtfHoldingsFetchedAt, getVariantsFetchedAt } from "@/server/queries/etf-holdings";
import {
  getTickerProfilesMap,
  getTickerProfileFetchedAt,
} from "@/server/queries/ticker-profiles";
import { and, eq } from "drizzle-orm";
import type { ActionResult } from "@/server/types/action-result";
import type { RefreshResult } from "@/server/types/market-data";

/**
 * Refresh stock prices for all unique tickers in the transactions table.
 * Always writes the latest EOD closing prices, overwriting any stale intraday data.
 */
export async function refreshPrices(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique tickers from transactions
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Fetch official closing prices via FMP EOD light endpoint
    const quotes = await fetchStockPrices(allTickers);

    if (quotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch stock prices. Please try again.",
      };
    }

    // 3. Keep only the latest date per symbol (most recent close)
    const latestBySymbol = new Map<string, (typeof quotes)[number]>();
    for (const q of quotes) {
      const existing = latestBySymbol.get(q.symbol);
      if (!existing || q.date > existing.date) {
        latestBySymbol.set(q.symbol, q);
      }
    }
    const latestQuotes = [...latestBySymbol.values()];

    // 4. Write results to market_data table (atomic, upsert via delete+insert).
    const fetchedAt = new Date().toISOString();
    db.transaction((tx) => {
      for (const quote of latestQuotes) {
        tx.delete(marketData)
          .where(
            and(
              eq(marketData.symbol, quote.symbol),
              eq(marketData.type, "stock_price"),
              eq(marketData.date, quote.date)
            )
          )
          .run();
        tx.insert(marketData)
          .values({
            symbol: quote.symbol,
            type: "stock_price",
            date: quote.date,
            value: quote.price,
            fetchedAt,
          })
          .run();
      }
    });

    // 5. Revalidate
    revalidatePath("/", "layout");

    // 6. Return result
    const skipped = allTickers.length - latestQuotes.length;
    return {
      success: true,
      data: { updated: latestQuotes.length, skipped },
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
 * Always writes the latest EOD closing rates, overwriting any stale data.
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

    // 2. Fetch official closing FX rates via FMP EOD light endpoint
    const fxQuotes = await fetchFxRates(allCurrencies);

    if (fxQuotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch FX rates. Please try again.",
      };
    }

    // 3. Keep only the latest date per symbol (most recent close)
    const latestBySymbol = new Map<string, (typeof fxQuotes)[number]>();
    for (const q of fxQuotes) {
      const existing = latestBySymbol.get(q.symbol);
      if (!existing || q.date > existing.date) {
        latestBySymbol.set(q.symbol, q);
      }
    }
    const latestQuotes = [...latestBySymbol.values()];

    // 4. Write results to market_data table (atomic, upsert via delete+insert)
    const fetchedAt = new Date().toISOString();
    db.transaction((tx) => {
      for (const quote of latestQuotes) {
        tx.delete(marketData)
          .where(
            and(
              eq(marketData.symbol, quote.symbol),
              eq(marketData.type, "fx_rate"),
              eq(marketData.date, quote.date)
            )
          )
          .run();
        tx.insert(marketData)
          .values({
            symbol: quote.symbol,
            type: "fx_rate",
            date: quote.date,
            value: quote.price,
            fetchedAt,
          })
          .run();
      }
    });

    // 5. Revalidate
    revalidatePath("/", "layout");

    // 6. Return result
    const skipped = allCurrencies.length - latestQuotes.length;
    return {
      success: true,
      data: { updated: latestQuotes.length, skipped },
    };
  } catch (error) {
    console.error("refreshFxRates failed:", error);
    return {
      success: false,
      error: "Unable to fetch FX rates. Please try again.",
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
