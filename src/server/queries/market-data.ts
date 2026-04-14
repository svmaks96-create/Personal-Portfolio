import { db } from "@/server/db";
import { marketData, transactions } from "@/server/db/schema";
import { and, eq, max, inArray, sum, gt, sql } from "drizzle-orm";

/**
 * Get existing (symbol, date) pairs for given symbols and type.
 * Used by FR51 skip optimization — checks per-symbol trading dates,
 * since different exchanges have different trading calendars.
 */
export function getExistingSymbolDates(
  symbols: string[],
  type: "stock_price" | "fx_rate"
): Set<string> {
  if (symbols.length === 0) return new Set();

  const rows = db
    .select({ symbol: marketData.symbol, date: marketData.date })
    .from(marketData)
    .where(and(inArray(marketData.symbol, symbols), eq(marketData.type, type)))
    .all();

  return new Set(rows.map((r) => `${r.symbol}:${r.date}`));
}

/**
 * Get the oldest (stalest) trading date across the latest entry per symbol.
 * This represents the freshness of the least-current data point,
 * so the user knows if ANY position has stale prices.
 * Returns a "yyyy-MM-dd" string or null if no market data exists.
 */
export function getStalestMarketDate(): string | null {
  // Only consider symbols with open positions (net shares > 0)
  const activeTickers = db
    .select({ ticker: transactions.ticker })
    .from(transactions)
    .groupBy(transactions.ticker)
    .having(
      gt(
        sum(
          sql`CASE WHEN ${transactions.action} = 'buy' THEN ${transactions.quantity} WHEN ${transactions.action} = 'sell' THEN -${transactions.quantity} ELSE 0 END`
        ),
        0
      )
    )
    .all()
    .map((r) => r.ticker);

  if (activeTickers.length === 0) return null;

  const rows = db
    .select({ symbol: marketData.symbol, latestDate: max(marketData.date) })
    .from(marketData)
    .where(
      and(
        eq(marketData.type, "stock_price"),
        inArray(marketData.symbol, activeTickers)
      )
    )
    .groupBy(marketData.symbol)
    .all();

  if (rows.length === 0) return null;

  let stalest: string | null = null;
  for (const row of rows) {
    if (row.latestDate && (!stalest || row.latestDate < stalest)) {
      stalest = row.latestDate;
    }
  }

  return stalest;
}
