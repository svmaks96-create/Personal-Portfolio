import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Deep price-history backfill for the risk module: fetches daily closes from
 * RISK_HISTORY_START (2017) for every currently-held ticker, the benchmark
 * ETFs, and the factor proxies. Idempotent — re-running upserts the same
 * (symbol, date) rows. The regular in-app backfill action maintains the same
 * range going forward; this script exists to populate it the first time
 * without a running dev server.
 */

// .env.local must be in process.env before src/server/config.ts captures it,
// so every app import below is dynamic.
function loadEnvLocal(): void {
  const text = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = raw.replace(/^["']|["']$/g, "");
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const { fetchStockPrices, BENCHMARK_TICKERS } = await import(
    "../src/server/services/fmp"
  );
  const { RISK_PROXY_TICKERS, RISK_HISTORY_START } = await import(
    "../src/server/services/risk/constants"
  );
  const { upsertMarketDataRows } = await import(
    "../src/server/db/market-data-writer"
  );
  const { getCurrentlyHeldTickers } = await import(
    "../src/server/queries/market-data"
  );

  const symbols = [
    ...new Set([
      ...getCurrentlyHeldTickers(),
      ...BENCHMARK_TICKERS,
      ...RISK_PROXY_TICKERS,
    ]),
  ].sort();

  console.log(`Backfilling ${symbols.length} symbols from ${RISK_HISTORY_START}`);
  const fetchedAt = new Date().toISOString();
  let totalRows = 0;
  const failed: string[] = [];

  for (const symbol of symbols) {
    const quotes = await fetchStockPrices([symbol], RISK_HISTORY_START);
    if (quotes.length === 0) {
      failed.push(symbol);
      console.log(`  ${symbol.padEnd(6)} — no data returned`);
      continue;
    }
    upsertMarketDataRows(quotes, "stock_price", fetchedAt);
    totalRows += quotes.length;
    console.log(
      `  ${symbol.padEnd(6)} ${String(quotes.length).padStart(5)} rows ` +
        `(${quotes[quotes.length - 1]?.date} … ${quotes[0]?.date})`
    );
  }

  console.log(`Done: ${totalRows} rows upserted across ${symbols.length - failed.length} symbols.`);
  if (failed.length > 0) {
    console.log(`No data for: ${failed.join(", ")}`);
  }
}

main();
