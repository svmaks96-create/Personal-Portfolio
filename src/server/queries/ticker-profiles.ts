import { cache } from "react";
import { db } from "@/server/db";
import { tickerProfiles } from "@/server/db/schema";
import { eq } from "drizzle-orm";

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
 * Get the fetchedAt timestamp for a ticker's cached profile.
 * Returns null if no profile is cached for this ticker.
 */
export function getTickerProfileFetchedAt(ticker: string): string | null {
  const row = db
    .select({ fetchedAt: tickerProfiles.fetchedAt })
    .from(tickerProfiles)
    .where(eq(tickerProfiles.ticker, ticker))
    .limit(1)
    .all();

  return row.length > 0 ? row[0].fetchedAt : null;
}
