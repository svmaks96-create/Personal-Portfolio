"use server";

import { revalidatePath } from "next/cache";
import { differenceInDays, fromUnixTime, parseISO } from "date-fns";
import { db } from "@/server/db";
import { transactions, marketData, etfHoldings, tickerVariants } from "@/server/db/schema";
import {
  fetchStockPrices,
  fetchFxRates,
  fetchCompanyProfiles,
  fetchEtfHoldings,
  fetchExchangeVariants,
} from "@/server/services/fmp";
import { getExistingSymbolDates } from "@/server/queries/market-data";
import { getEtfHoldingsFetchedAt, getVariantsFetchedAt } from "@/server/queries/etf-holdings";
import { eq } from "drizzle-orm";
import type { ActionResult } from "@/server/types/action-result";
import type { RefreshResult } from "@/server/types/market-data";

/**
 * Refresh stock prices for all unique tickers in the transactions table.
 * Skips tickers that already have today's data (FR51).
 */
export async function refreshPrices(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique tickers from transactions
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Call FMP service first to get quotes with actual trading dates
    const quotes = await fetchStockPrices(allTickers);

    if (quotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch stock prices. Please try again.",
      };
    }

    // 3. Check which tickers already have data for their trading date (FR51 skip)
    // Each quote carries its own trading date (exchanges have different calendars)
    const existingPairs = getExistingSymbolDates(
      quotes.map((q) => q.symbol),
      "stock_price"
    );
    const newQuotes = quotes.filter((q) => {
      const quoteDate = fromUnixTime(q.timestamp).toISOString().slice(0, 10);
      return !existingPairs.has(`${q.symbol}:${quoteDate}`);
    });
    const skipped = allTickers.length - newQuotes.length;

    if (newQuotes.length === 0) {
      return { success: true, data: { updated: 0, skipped } };
    }

    // 4. Write results to market_data table (atomic)
    const fetchedAt = new Date().toISOString();
    db.transaction((tx) => {
      for (const quote of newQuotes) {
        const quoteDate = fromUnixTime(quote.timestamp).toISOString().slice(0, 10);
        tx.insert(marketData)
          .values({
            symbol: quote.symbol,
            type: "stock_price",
            date: quoteDate,
            value: quote.price,
            fetchedAt,
          })
          .run();
      }
    });

    // 5. Revalidate
    revalidatePath("/", "layout");

    // 6. Return result
    return {
      success: true,
      data: { updated: newQuotes.length, skipped },
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
 * Skips currencies that already have today's data (FR51).
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

    // 2. Call FMP service first to get quotes with actual trading dates
    const fxQuotes = await fetchFxRates(allCurrencies);

    if (fxQuotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch FX rates. Please try again.",
      };
    }

    // 3. Check which pairs already have data for their trading date (FR51 skip)
    const existingPairs = getExistingSymbolDates(
      fxQuotes.map((q) => q.symbol),
      "fx_rate"
    );
    const newQuotes = fxQuotes.filter((q) => {
      const quoteDate = fromUnixTime(q.timestamp).toISOString().slice(0, 10);
      return !existingPairs.has(`${q.symbol}:${quoteDate}`);
    });
    const skipped = allCurrencies.length - newQuotes.length;

    if (newQuotes.length === 0) {
      return { success: true, data: { updated: 0, skipped } };
    }

    // 4. Write results to market_data table (atomic)
    const fetchedAt = new Date().toISOString();
    db.transaction((tx) => {
      for (const quote of newQuotes) {
        const quoteDate = fromUnixTime(quote.timestamp).toISOString().slice(0, 10);
        tx.insert(marketData)
          .values({
            symbol: quote.symbol,
            type: "fx_rate",
            date: quoteDate,
            value: quote.price,
            fetchedAt,
          })
          .run();
      }
    });

    // 5. Revalidate
    revalidatePath("/", "layout");

    // 6. Return result
    return {
      success: true,
      data: { updated: newQuotes.length, skipped },
    };
  } catch (error) {
    console.error("refreshFxRates failed:", error);
    return {
      success: false,
      error: "Unable to fetch FX rates. Please try again.",
    };
  }
}

const ETF_HOLDINGS_STALENESS_DAYS = 7;

/**
 * Refresh ETF holdings for all ETF tickers in the transactions table.
 * Detects ETFs via FMP company profile, then fetches holdings for stale/missing ETFs.
 * Holdings are considered stale after 7 days (ETFs rebalance quarterly).
 */
export async function refreshEtfHoldings(): Promise<ActionResult<RefreshResult>> {
  try {
    // 1. Get unique tickers from transactions
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Detect which tickers are ETFs via FMP profiles
    const profiles = await fetchCompanyProfiles(allTickers);
    const etfTickers = profiles.filter((p) => p.isEtf).map((p) => p.symbol);
    const stockTickers = profiles.filter((p) => !p.isEtf).map((p) => p.symbol);

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
