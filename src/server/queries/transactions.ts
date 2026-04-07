import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { count, eq, and, desc } from "drizzle-orm";
import { formatDate, formatCurrency, formatShares } from "@/lib/formatting";

export interface TransactionRow {
  id: number;
  date: { value: string; display: string };
  ticker: string;
  action: string;
  quantity: { value: number; display: string };
  price: { value: number; display: string };
  fees: { value: number; display: string };
  portfolio: string;
  currency: string;
}

export function getTransactionCount(): number {
  const result = db.select({ count: count() }).from(transactions).get();
  return result?.count ?? 0;
}

export function getTransactions(
  portfolio?: string,
  ticker?: string,
): TransactionRow[] {
  const conditions = [];
  if (portfolio) conditions.push(eq(transactions.portfolio, portfolio));
  if (ticker) conditions.push(eq(transactions.ticker, ticker));

  const rows = db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .all();

  return rows.map((row) => ({
    id: row.id,
    date: { value: row.date, display: formatDate(row.date) },
    ticker: row.ticker,
    action: row.action,
    quantity: { value: row.quantity, display: formatShares(row.quantity) },
    price: { value: row.price, display: formatCurrency(row.price) },
    fees: { value: row.fees, display: formatCurrency(row.fees) },
    portfolio: row.portfolio,
    currency: row.currency,
  }));
}
