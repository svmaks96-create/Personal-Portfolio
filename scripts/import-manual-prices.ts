import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { upsertMarketDataRows } from "../src/server/db/market-data-writer";
import type { FmpEodQuote } from "../src/server/types/market-data";

/**
 * One-shot importer for manually-collected daily closing prices.
 *
 * CSV format (column order is what matters; header row is skipped):
 *   <symbol>, <yyyy-MM-dd>, <price in USD>
 *
 * Trailing empty columns (Excel artifact) are tolerated. Rows with empty
 * or non-numeric prices are skipped silently — the user can leave gaps.
 *
 * Default file path: data/manual-prices/UAE_manual_price.csv
 * Override with the first CLI argument.
 */

const DEFAULT_PATH = "data/manual-prices/UAE_manual_price.csv";

interface ParsedRow {
  symbol: string;
  date: string;
  price: number;
}

function parseCsv(text: string): { rows: ParsedRow[]; skipped: number } {
  const lines = text.split(/\r?\n/);
  const rows: ParsedRow[] = [];
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.length === 0) continue;
    if (i === 0) continue; // header

    const cells = line.split(",");
    const symbol = (cells[0] ?? "").trim();
    const date = (cells[1] ?? "").trim();
    const priceRaw = (cells[2] ?? "").trim();

    if (!symbol || !date || !priceRaw) {
      skipped++;
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      skipped++;
      continue;
    }
    const price = Number(priceRaw);
    if (!Number.isFinite(price) || price <= 0) {
      skipped++;
      continue;
    }
    rows.push({ symbol, date, price });
  }

  return { rows, skipped };
}

function main(): void {
  const csvPath = resolve(process.cwd(), process.argv[2] ?? DEFAULT_PATH);
  console.log(`Reading ${csvPath}`);

  const text = readFileSync(csvPath, "utf8");
  const { rows, skipped } = parseCsv(text);

  if (rows.length === 0) {
    console.error(
      `No valid rows found. Skipped ${skipped} rows (empty/invalid).`
    );
    process.exit(1);
  }

  const quotes: FmpEodQuote[] = rows.map((r) => ({
    symbol: r.symbol,
    date: r.date,
    price: r.price,
    volume: 0,
  }));

  const fetchedAt = new Date().toISOString();
  const symbolsTouched = upsertMarketDataRows(quotes, "stock_price", fetchedAt);

  const perSymbol = new Map<string, number>();
  for (const r of rows) perSymbol.set(r.symbol, (perSymbol.get(r.symbol) ?? 0) + 1);

  console.log(
    `Imported ${rows.length} rows across ${symbolsTouched} symbols ` +
      `(${skipped} skipped).`
  );
  for (const [symbol, count] of [...perSymbol.entries()].sort()) {
    console.log(`  ${symbol.padEnd(20)} ${count}`);
  }
}

main();
