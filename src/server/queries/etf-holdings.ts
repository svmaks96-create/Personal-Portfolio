import { db } from "@/server/db";
import { etfHoldings, tickerVariants } from "@/server/db/schema";
import { inArray } from "drizzle-orm";

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
 * Map of ETF symbol -> fetchedAt timestamp for the given ETFs.
 * ETFs with no cached holdings are absent from the map.
 */
export function getEtfHoldingsFetchedAtMap(
  etfSymbols: string[]
): Record<string, string> {
  if (etfSymbols.length === 0) return {};

  const rows = db
    .selectDistinct({
      etfSymbol: etfHoldings.etfSymbol,
      fetchedAt: etfHoldings.fetchedAt,
    })
    .from(etfHoldings)
    .where(inArray(etfHoldings.etfSymbol, etfSymbols))
    .all();

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.etfSymbol] = row.fetchedAt;
  }
  return map;
}

/**
 * Get a reverse mapping from variant symbols to user tickers.
 * E.g., { "2330.TW": "TSM", "TSFA.F": "TSM", "ASML.AS": "ASML" }
 * Used during look-through to map ETF holdings back to user's tickers.
 */
export function getVariantToTickerMap(
  tickers: string[]
): Record<string, string> {
  if (tickers.length === 0) return {};

  const rows = db
    .select({
      ticker: tickerVariants.ticker,
      variant: tickerVariants.variant,
    })
    .from(tickerVariants)
    .where(inArray(tickerVariants.ticker, tickers))
    .all();

  const map: Record<string, string> = {};
  for (const row of rows) {
    // Don't map the ticker to itself — that's handled directly
    if (row.variant !== row.ticker) {
      map[row.variant] = row.ticker;
    }
  }

  return map;
}

/**
 * Map of ticker -> fetchedAt timestamp for the given tickers' cached variants.
 * Tickers with no cached variants are absent from the map.
 */
export function getVariantsFetchedAtMap(
  tickers: string[]
): Record<string, string> {
  if (tickers.length === 0) return {};

  const rows = db
    .selectDistinct({
      ticker: tickerVariants.ticker,
      fetchedAt: tickerVariants.fetchedAt,
    })
    .from(tickerVariants)
    .where(inArray(tickerVariants.ticker, tickers))
    .all();

  const map: Record<string, string> = {};
  for (const row of rows) {
    map[row.ticker] = row.fetchedAt;
  }
  return map;
}
