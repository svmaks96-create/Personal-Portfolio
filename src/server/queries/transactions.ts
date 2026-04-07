import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { count, eq, and, desc } from "drizzle-orm";
import { formatDate, formatCurrency, formatShares } from "@/lib/formatting";
import Decimal from "decimal.js";

export interface TransactionRow {
  id: number;
  date: { value: string; display: string };
  ticker: string;
  action: string;
  quantity: { value: number | null; display: string };
  grossAmount: { value: number | null; display: string };
  fees: { value: number | null; display: string };
  netAmount: { value: number; display: string };
  netAvgPrice: { value: number | null; display: string };
  portfolio: string;
  currency: string;
}

export function getTransactionCount(): number {
  const result = db.select({ count: count() }).from(transactions).get();
  return result?.count ?? 0;
}

function computeNetAmount(action: string, grossAmount: number, fees: number): number {
  const g = new Decimal(grossAmount);
  const f = new Decimal(fees);
  switch (action) {
    case "buy":
      return g.plus(f).toNumber();
    case "sell":
      return g.minus(f).toNumber();
    case "dividend":
      return g.toNumber();
    case "fee":
      return f.toNumber();
    default:
      return g.toNumber();
  }
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
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();

  return rows.map((row) => {
    const netAmount = computeNetAmount(row.action, row.grossAmount, row.fees);
    const hasShares = row.quantity > 0;
    const netAvgPrice = hasShares
      ? new Decimal(netAmount).div(new Decimal(row.quantity)).toNumber()
      : null;

    const isDividend = row.action === "dividend";
    const isFee = row.action === "fee";
    const dash = "\u2014";

    return {
      id: row.id,
      date: { value: row.date, display: formatDate(row.date) },
      ticker: row.ticker,
      action: row.action,
      quantity: {
        value: isDividend || isFee ? null : row.quantity,
        display: isDividend || isFee ? dash : formatShares(row.quantity),
      },
      grossAmount: {
        value: isFee ? null : row.grossAmount,
        display: isFee ? dash : formatCurrency(row.grossAmount),
      },
      fees: {
        value: isDividend ? null : row.fees,
        display: isDividend ? dash : formatCurrency(row.fees),
      },
      netAmount: { value: netAmount, display: formatCurrency(netAmount) },
      netAvgPrice: {
        value: netAvgPrice,
        display: netAvgPrice !== null ? formatCurrency(netAvgPrice) : dash,
      },
      portfolio: row.portfolio,
      currency: row.currency,
    };
  });
}
