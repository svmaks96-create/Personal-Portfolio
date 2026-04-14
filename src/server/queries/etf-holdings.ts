import { db } from "@/server/db";
import { etfHoldings } from "@/server/db/schema";
import { eq, inArray } from "drizzle-orm";

/**
 * Get cached ETF holdings grouped by ETF symbol.
 * Returns a map from ETF symbol to its underlying holdings.
 */
export function getEtfHoldingsMap(
  etfSymbols: string[]
): Record<string, { asset: string; weightPercentage: number }[]> {
  if (etfSymbols.length === 0) return {};

  const rows = db
    .select({
      etfSymbol: etfHoldings.etfSymbol,
      asset: etfHoldings.asset,
      weightPercentage: etfHoldings.weightPercentage,
    })
    .from(etfHoldings)
    .where(inArray(etfHoldings.etfSymbol, etfSymbols))
    .all();

  const map: Record<string, { asset: string; weightPercentage: number }[]> = {};
  for (const row of rows) {
    const list = map[row.etfSymbol];
    if (list) {
      list.push({ asset: row.asset, weightPercentage: row.weightPercentage });
    } else {
      map[row.etfSymbol] = [{ asset: row.asset, weightPercentage: row.weightPercentage }];
    }
  }

  return map;
}

/**
 * Get the fetchedAt timestamp for an ETF's cached holdings.
 * Returns null if no holdings are cached for this ETF.
 */
export function getEtfHoldingsFetchedAt(etfSymbol: string): string | null {
  const row = db
    .select({ fetchedAt: etfHoldings.fetchedAt })
    .from(etfHoldings)
    .where(eq(etfHoldings.etfSymbol, etfSymbol))
    .limit(1)
    .all();

  return row.length > 0 ? row[0].fetchedAt : null;
}
