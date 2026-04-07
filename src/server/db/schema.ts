import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

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
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("market_data_symbol_type_date_idx").on(table.symbol, table.type, table.date),
  ]
);
