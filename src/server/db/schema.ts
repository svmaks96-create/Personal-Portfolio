import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    ticker: text("ticker").notNull(),
    action: text("action").$type<"buy" | "sell" | "dividend" | "fee">().notNull(),
    quantity: real("quantity").notNull(),
    grossAmount: real("gross_amount").notNull(),
    fees: real("fees").notNull().default(0),
    portfolio: text("portfolio").notNull(),
    currency: text("currency").notNull(),
  },
  (table) => [
    index("transactions_ticker_portfolio_idx").on(table.ticker, table.portfolio),
    index("transactions_date_idx").on(table.date),
  ]
);

export const marketData = sqliteTable(
  "market_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    type: text("type").$type<"stock_price" | "fx_rate">().notNull(),
    date: text("date").notNull(),
    value: real("value").notNull(),
    name: text("name"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("market_data_symbol_type_date_idx").on(table.symbol, table.type, table.date),
  ]
);

export const etfHoldings = sqliteTable(
  "etf_holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    etfSymbol: text("etf_symbol").notNull(),
    asset: text("asset").notNull(),
    weightPercentage: real("weight_percentage").notNull(),
    name: text("name"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("etf_holdings_etf_symbol_idx").on(table.etfSymbol),
  ]
);

export const tickerVariants = sqliteTable(
  "ticker_variants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    variant: text("variant").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("ticker_variants_ticker_idx").on(table.ticker),
    uniqueIndex("ticker_variants_variant_idx").on(table.variant),
  ]
);
