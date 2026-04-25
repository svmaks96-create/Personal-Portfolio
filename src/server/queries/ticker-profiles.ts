import { cache } from "react";
import { db } from "@/server/db";
import { tickerProfiles } from "@/server/db/schema";
import { inArray } from "drizzle-orm";

export interface TickerProfile {
  name: string | null;
  isEtf: boolean;
}

/**
 * Get all cached ticker profiles as a map from ticker to profile.
 */
export const getTickerProfilesMap = cache((): Record<string, TickerProfile> => {
  const rows = db
    .select({
      ticker: tickerProfiles.ticker,
      name: tickerProfiles.name,
      isEtf: tickerProfiles.isEtf,
    })
    .from(tickerProfiles)
    .all();

  const map: Record<string, TickerProfile> = {};
  for (const row of rows) {
    map[row.ticker] = { name: row.name, isEtf: row.isEtf };
  }
  return map;
});

/**
 * Map of ticker -> fetchedAt timestamp for the given tickers.
 * Tickers with no cached profile are absent from the map.
 */
export function getTickerProfileFetchedAtMap(
  tickers: string[]
): Record<string, string> {
  if (tickers.length === 0) return {};

  const rows = db
    .select({
      ticker: tickerProfiles.ticker,
      fetchedAt: tickerProfiles.fetchedAt,
    })
    .from(tickerProfiles)
    .where(inArray(tickerProfiles.ticker, tickers))
    .all();

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.ticker] = row.fetchedAt;
  }
  return map;
}
