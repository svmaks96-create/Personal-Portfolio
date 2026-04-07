import { db } from "@/server/db";
import { marketData } from "@/server/db/schema";
import { and, eq, desc } from "drizzle-orm";

/**
 * Get symbols that already have market data for the given date and type.
 * Used by FR51 skip optimization to avoid redundant FMP API calls.
 */
export function getExistingSymbolsForDate(
  date: string,
  type: "stock_price" | "fx_rate"
): string[] {
  const rows = db
    .select({ symbol: marketData.symbol })
    .from(marketData)
    .where(and(eq(marketData.date, date), eq(marketData.type, type)))
    .all();

  return rows.map((r) => r.symbol);
}

/**
 * Get the latest fetched_at timestamp across all market data.
 * Returns null if no market data exists. Needed by Story 2.3 for freshness display.
 */
export function getLatestFetchTimestamp(): string | null {
  const row = db
    .select({ fetchedAt: marketData.fetchedAt })
    .from(marketData)
    .orderBy(desc(marketData.fetchedAt))
    .limit(1)
    .get();

  return row?.fetchedAt ?? null;
}
