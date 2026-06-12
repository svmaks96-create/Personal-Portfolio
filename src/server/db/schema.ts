import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    ticker: text("ticker").notNull(),
    action: text("action").$type<"buy" | "sell" | "dividend" | "fee">().notNull(),
    instrument: text("instrument").$type<"stock" | "option">().notNull().default("stock"),
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
    type: text("type").$type<"stock_price" | "fx_rate" | "option_mark">().notNull(),
    date: text("date").notNull(),
    value: real("value").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("market_data_symbol_type_date_idx").on(table.symbol, table.type, table.date),
  ]
);

export const tickerProfiles = sqliteTable(
  "ticker_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    name: text("name"),
    isEtf: integer("is_etf", { mode: "boolean" }).notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [uniqueIndex("ticker_profiles_ticker_idx").on(table.ticker)]
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

export const allocationTargets = sqliteTable(
  "allocation_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").$type<"ticker" | "cash">().notNull(),
    name: text("name").notNull(),
    targetWeight: real("target_weight").notNull(),
    cashAmountUsd: real("cash_amount_usd"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("allocation_targets_kind_name_idx").on(table.kind, table.name),
  ]
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
