import { cache } from "react";
import { db } from "@/server/db";
import { tickerFundamentals, tickerDividends } from "@/server/db/schema";
import { eq, inArray, desc } from "drizzle-orm";

export type TickerFundamentals = typeof tickerFundamentals.$inferSelect;
export type TickerDividend = typeof tickerDividends.$inferSelect;

/** Cached fundamentals snapshot for a ticker, or null if never fetched. */
export const getTickerFundamentals = cache(
  (ticker: string): TickerFundamentals | null => {
    const row = db
      .select()
      .from(tickerFundamentals)
      .where(eq(tickerFundamentals.ticker, ticker))
      .get();
    return row ?? null;
  }
);

/** Most-recent dividend events for a ticker, newest ex-date first. */
export const getTickerDividends = cache(
  (ticker: string, limit = 8): TickerDividend[] => {
    return db
      .select()
      .from(tickerDividends)
      .where(eq(tickerDividends.ticker, ticker))
      .orderBy(desc(tickerDividends.exDate))
      .limit(limit)
      .all();
  }
);

/**
 * Map of ticker -> sector for every ticker that has one recorded.
 *
 * Callers must decide what to do with funds: FMP reports every ETF as
 * "Financial Services", so a sector roll-up that trusts this blindly files
 * VTI, BND and VNQ in one bucket. `computeAttribution` routes funds to their
 * own bucket instead.
 */
export const getSectorByTickerMap = cache((): Record<string, string> => {
  const rows = db
    .select({
      ticker: tickerFundamentals.ticker,
      sector: tickerFundamentals.sector,
    })
    .from(tickerFundamentals)
    .all();

  const map: Record<string, string> = {};
  for (const row of rows) {
    if (row.sector) map[row.ticker] = row.sector;
  }
  return map;
});

/**
 * Map of ticker -> fetchedAt for the given tickers' fundamentals snapshots.
 * Tickers with no cached row are absent from the map. Drives the staleness gate
 * in refreshTickerFundamentals (mirrors getTickerProfileFetchedAtMap).
 */
export function getTickerFundamentalsFetchedAtMap(
  tickers: string[]
): Record<string, string> {
  if (tickers.length === 0) return {};

  const rows = db
    .select({
      ticker: tickerFundamentals.ticker,
      fetchedAt: tickerFundamentals.fetchedAt,
    })
    .from(tickerFundamentals)
    .where(inArray(tickerFundamentals.ticker, tickers))
    .all();

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.ticker] = row.fetchedAt;
  }
  return map;
}
