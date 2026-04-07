"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { fetchStockPrices, fetchFxRates } from "@/server/services/fmp";
import { getExistingSymbolsForDate } from "@/server/queries/market-data";
import type { ActionResult } from "@/server/types/action-result";
import type { RefreshResult } from "@/server/types/market-data";

/**
 * Refresh stock prices for all unique tickers in the transactions table.
 * Skips tickers that already have today's data (FR51).
 */
export async function refreshPrices(): Promise<ActionResult<RefreshResult>> {
  try {
    const today = format(new Date(), "yyyy-MM-dd");

    // 1. Get unique tickers from transactions
    const rows = db.select({ ticker: transactions.ticker }).from(transactions).all();
    const allTickers = [...new Set(rows.map((r) => r.ticker))];

    if (allTickers.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Check which tickers already have today's data (FR51 skip optimization)
    const existingSymbols = getExistingSymbolsForDate(today, "stock_price");
    const existingSet = new Set(existingSymbols);
    const tickersToFetch = allTickers.filter((t) => !existingSet.has(t));
    const skipped = allTickers.length - tickersToFetch.length;

    if (tickersToFetch.length === 0) {
      return { success: true, data: { updated: 0, skipped } };
    }

    // 3. Call FMP service
    const quotes = await fetchStockPrices(tickersToFetch);

    if (quotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch stock prices. Please try again.",
      };
    }

    // 4. Write results to market_data table (atomic)
    const fetchedAt = new Date().toISOString();
    db.transaction((tx) => {
      for (const quote of quotes) {
        tx.insert(marketData)
          .values({
            symbol: quote.symbol,
            type: "stock_price",
            date: today,
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
      data: { updated: quotes.length, skipped },
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
    const today = format(new Date(), "yyyy-MM-dd");

    // 1. Get unique non-USD currencies from transactions
    const rows = db.select({ currency: transactions.currency }).from(transactions).all();
    const allCurrencies = [...new Set(rows.map((r) => r.currency))].filter(
      (c) => c !== "USD"
    );

    if (allCurrencies.length === 0) {
      return { success: true, data: { updated: 0, skipped: 0 } };
    }

    // 2. Check which FX pairs already have today's data (FR51 skip optimization)
    const existingSymbols = getExistingSymbolsForDate(today, "fx_rate");
    const existingSet = new Set(existingSymbols);
    const pairsToFetch = allCurrencies.filter((c) => !existingSet.has(`${c}USD`));
    const skipped = allCurrencies.length - pairsToFetch.length;

    if (pairsToFetch.length === 0) {
      return { success: true, data: { updated: 0, skipped } };
    }

    // 3. Call FMP service
    const fxQuotes = await fetchFxRates(pairsToFetch);

    if (fxQuotes.length === 0) {
      return {
        success: false,
        error: "Unable to fetch FX rates. Please try again.",
      };
    }

    // 4. Write results to market_data table (atomic)
    const fetchedAt = new Date().toISOString();
    db.transaction((tx) => {
      for (const quote of fxQuotes) {
        tx.insert(marketData)
          .values({
            symbol: quote.symbol,
            type: "fx_rate",
            date: today,
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
      data: { updated: fxQuotes.length, skipped },
    };
  } catch (error) {
    console.error("refreshFxRates failed:", error);
    return {
      success: false,
      error: "Unable to fetch FX rates. Please try again.",
    };
  }
}
