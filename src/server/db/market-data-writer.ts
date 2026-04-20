import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { marketData } from "@/server/db/schema";
import type { FmpEodQuote } from "@/server/types/market-data";

/**
 * Upsert quote rows into `market_data`, keyed on (symbol, type, date).
 * Atomic: wrapped in a single transaction. Returns the count of distinct
 * symbols that had at least one row written.
 *
 * Pure write helper — no `"use server"` so it can be imported from CLI
 * scripts as well as from server actions.
 */
export function upsertMarketDataRows(
  quotes: FmpEodQuote[],
  type: "stock_price" | "fx_rate",
  fetchedAt: string
): number {
  if (quotes.length === 0) return 0;

  const symbolsTouched = new Set<string>();
  db.transaction((tx) => {
    for (const quote of quotes) {
      tx.delete(marketData)
        .where(
          and(
            eq(marketData.symbol, quote.symbol),
            eq(marketData.type, type),
            eq(marketData.date, quote.date)
          )
        )
        .run();
      tx.insert(marketData)
        .values({
          symbol: quote.symbol,
          type,
          date: quote.date,
          value: quote.price,
          fetchedAt,
        })
        .run();
      symbolsTouched.add(quote.symbol);
    }
  });
  return symbolsTouched.size;
}
