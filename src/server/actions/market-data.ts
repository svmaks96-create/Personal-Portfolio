"use server";

import { revalidatePath } from "next/cache";
import { fromUnixTime } from "date-fns";
import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { fetchStockPrices, fetchFxRates } from "@/server/services/fmp";
import { getExistingSymbolDates } from "@/server/queries/market-data";
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