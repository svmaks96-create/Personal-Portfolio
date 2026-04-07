import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { transactions, marketData } from "./schema";
import { sql } from "drizzle-orm";

const sqlite = new Database("data/portfolio.db");
const db = drizzle(sqlite);

function seed() {
  db.transaction((tx) => {
    // Clear existing data (idempotent)
    tx.run(sql`DELETE FROM ${transactions}`);
    tx.run(sql`DELETE FROM ${marketData}`);

    // Seed transactions
    // gross_amount = total amount for shares (buy/sell) or total dividend received
    // fees = separate amount on top (buy) or deducted (sell)
    // For dividends: gross_amount = total received, quantity = 0, fees = 0
    // Withholding tax: separate dividend row with negative gross_amount
    tx.insert(transactions).values([
      // US Growth — AAPL (partial sell, still open)
      { date: "2025-06-15", ticker: "AAPL", action: "buy", quantity: 50, grossAmount: 9275.00, fees: 4.99, portfolio: "US Growth", currency: "USD" },
      { date: "2025-09-20", ticker: "AAPL", action: "buy", quantity: 30, grossAmount: 5760.00, fees: 4.99, portfolio: "US Growth", currency: "USD" },
      { date: "2025-12-10", ticker: "AAPL", action: "sell", quantity: 20, grossAmount: 4215.00, fees: 4.99, portfolio: "US Growth", currency: "USD" },
      { date: "2026-01-15", ticker: "AAPL", action: "dividend", quantity: 0, grossAmount: 15.00, fees: 0, portfolio: "US Growth", currency: "USD" },

      // US Growth — MSFT (buy, dividend with withholding tax, standalone fee)
      { date: "2025-07-01", ticker: "MSFT", action: "buy", quantity: 25, grossAmount: 8500.00, fees: 4.99, portfolio: "US Growth", currency: "USD" },
      { date: "2025-10-15", ticker: "MSFT", action: "dividend", quantity: 0, grossAmount: 18.75, fees: 0, portfolio: "US Growth", currency: "USD" },
      { date: "2025-10-15", ticker: "MSFT", action: "dividend", quantity: 0, grossAmount: -2.81, fees: 0, portfolio: "US Growth", currency: "USD" },
      { date: "2026-01-20", ticker: "MSFT", action: "fee", quantity: 0, grossAmount: 0, fees: 12.50, portfolio: "US Growth", currency: "USD" },

      // UK Income — VOD.L (fully closed position)
      { date: "2025-05-10", ticker: "VOD.L", action: "buy", quantity: 500, grossAmount: 360.00, fees: 8.00, portfolio: "UK Income", currency: "GBP" },
      { date: "2025-08-15", ticker: "VOD.L", action: "dividend", quantity: 0, grossAmount: 10.00, fees: 0, portfolio: "UK Income", currency: "GBP" },
      { date: "2025-11-20", ticker: "VOD.L", action: "sell", quantity: 500, grossAmount: 425.00, fees: 8.00, portfolio: "UK Income", currency: "GBP" },

      // UK Income — AAPL (same ticker, different portfolio)
      { date: "2025-08-01", ticker: "AAPL", action: "buy", quantity: 15, grossAmount: 2925.00, fees: 9.99, portfolio: "UK Income", currency: "USD" },

      // EU Diversified — SAP.DE (EUR currency, dividend with withholding tax)
      { date: "2025-06-20", ticker: "SAP.DE", action: "buy", quantity: 40, grossAmount: 6612.00, fees: 6.50, portfolio: "EU Diversified", currency: "EUR" },
      { date: "2026-02-01", ticker: "SAP.DE", action: "dividend", quantity: 0, grossAmount: 88.00, fees: 0, portfolio: "EU Diversified", currency: "EUR" },
      { date: "2026-02-01", ticker: "SAP.DE", action: "dividend", quantity: 0, grossAmount: -13.20, fees: 0, portfolio: "EU Diversified", currency: "EUR" },
    ]).run();

    // Seed market data — stock prices (recent)
    const now = "2026-04-06T12:00:00Z";

    tx.insert(marketData).values([
      // Stock prices
      { symbol: "AAPL", type: "stock_price", date: "2026-04-02", value: 215.30, fetchedAt: now },
      { symbol: "MSFT", type: "stock_price", date: "2026-04-02", value: 365.80, fetchedAt: now },
      { symbol: "VOD.L", type: "stock_price", date: "2026-04-02", value: 0.88, fetchedAt: now },
      { symbol: "SAP.DE", type: "stock_price", date: "2026-04-02", value: 178.50, fetchedAt: now },

      // FX rates — covering seed transaction dates + recent
      { symbol: "GBPUSD", type: "fx_rate", date: "2025-05-10", value: 1.2550, fetchedAt: now },
      { symbol: "GBPUSD", type: "fx_rate", date: "2025-08-15", value: 1.2700, fetchedAt: now },
      { symbol: "GBPUSD", type: "fx_rate", date: "2025-11-20", value: 1.2600, fetchedAt: now },
      { symbol: "GBPUSD", type: "fx_rate", date: "2026-04-02", value: 1.2850, fetchedAt: now },
      { symbol: "EURUSD", type: "fx_rate", date: "2025-06-20", value: 1.0890, fetchedAt: now },
      { symbol: "EURUSD", type: "fx_rate", date: "2026-02-01", value: 1.0750, fetchedAt: now },
      { symbol: "EURUSD", type: "fx_rate", date: "2026-04-02", value: 1.0920, fetchedAt: now },
    ]).run();
  });

  console.log("Seed complete.");
  console.log("  Transactions inserted:", db.select({ count: sql<number>`count(*)` }).from(transactions).get()?.count);
  console.log("  Market data inserted:", db.select({ count: sql<number>`count(*)` }).from(marketData).get()?.count);
}

seed();
sqlite.close();
