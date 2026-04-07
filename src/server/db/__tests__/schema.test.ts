import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { transactions, marketData } from "../schema";
import { sql } from "drizzle-orm";

function createTestDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite);

  // Create tables using raw SQL matching the schema
  sqlite.exec(`
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity REAL NOT NULL,
      gross_amount REAL NOT NULL,
      fees REAL NOT NULL DEFAULT 0,
      portfolio TEXT NOT NULL,
      currency TEXT NOT NULL
    );
    CREATE TABLE market_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      type TEXT NOT NULL,
      date TEXT NOT NULL,
      value REAL NOT NULL,
      fetched_at TEXT NOT NULL
    );
  `);

  return { db, sqlite };
}

describe("transactions schema", () => {
  it("inserts and retrieves a transaction", () => {
    const { db, sqlite } = createTestDb();

    db.insert(transactions).values({
      date: "2026-01-01",
      ticker: "AAPL",
      action: "buy",
      quantity: 10,
      grossAmount: 1500.0,
      fees: 4.99,
      portfolio: "Test",
      currency: "USD",
    }).run();

    const rows = db.select().from(transactions).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].ticker).toBe("AAPL");
    expect(rows[0].action).toBe("buy");
    expect(rows[0].quantity).toBe(10);
    expect(rows[0].grossAmount).toBe(1500.0);
    expect(rows[0].fees).toBe(4.99);

    sqlite.close();
  });

  it("defaults fees to 0", () => {
    const { db, sqlite } = createTestDb();

    db.insert(transactions).values({
      date: "2026-01-01",
      ticker: "MSFT",
      action: "dividend",
      quantity: 0,
      grossAmount: 18.75,
      portfolio: "Test",
      currency: "USD",
    }).run();

    const rows = db.select().from(transactions).all();
    expect(rows[0].fees).toBe(0);

    sqlite.close();
  });
});

describe("market_data schema", () => {
  it("inserts and retrieves market data", () => {
    const { db, sqlite } = createTestDb();

    db.insert(marketData).values({
      symbol: "AAPL",
      type: "stock_price",
      date: "2026-04-04",
      value: 215.30,
      fetchedAt: "2026-04-04T12:00:00Z",
    }).run();

    const rows = db.select().from(marketData).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe("AAPL");
    expect(rows[0].type).toBe("stock_price");
    expect(rows[0].value).toBe(215.30);

    sqlite.close();
  });
});

describe("seed idempotency", () => {
  it("produces consistent counts after clear and re-insert", () => {
    const { db, sqlite } = createTestDb();

    // Insert some data
    db.insert(transactions).values({
      date: "2026-01-01",
      ticker: "AAPL",
      action: "buy",
      quantity: 10,
      grossAmount: 1500.0,
      portfolio: "Test",
      currency: "USD",
    }).run();

    // Clear and re-insert (simulating seed idempotency)
    db.run(sql`DELETE FROM ${transactions}`);

    db.insert(transactions).values({
      date: "2026-01-01",
      ticker: "AAPL",
      action: "buy",
      quantity: 10,
      grossAmount: 1500.0,
      portfolio: "Test",
      currency: "USD",
    }).run();

    const count = db.select({ count: sql<number>`count(*)` }).from(transactions).get();
    expect(count?.count).toBe(1);

    sqlite.close();
  });
});
