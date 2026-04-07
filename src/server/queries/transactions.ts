import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { count, eq, and, desc } from "drizzle-orm";
import { formatDate, formatCurrency, formatShares } from "@/lib/formatting";

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
  switch (action) {
    case "buy":
      return grossAmount + fees;
    case "sell":
      return grossAmount - fees;
    case "dividend":
      return grossAmount;
    case "fee":
      return fees;
    default:
      return grossAmount;
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
    .orderBy(desc(transactions.date))
    .all();

  return rows.map((row) => {
    const netAmount = computeNetAmount(row.action, row.grossAmount, row.fees);
    const hasShares = row.quantity > 0;
    const netAvgPrice = hasShares ? netAmount / row.quantity : null;

    // For dividends and fees, quantity/grossAmount/fees may be zero — show N/A
    const isDividend = row.action === "dividend";
    const isFee = row.action === "fee";

    return {
      id: row.id,
      date: { value: row.date, display: formatDate(row.date) },
      ticker: row.ticker,
      action: row.action,
      quantity: {
        value: isDividend || isFee ? null : row.quantity,
        display: isDividend || isFee ? "N/A" : formatShares(row.quantity),
      },
      grossAmount: {
        value: isFee ? null : row.grossAmount,
        display: isFee ? "N/A" : formatCurrency(row.grossAmount),
      },
      fees: {
        value: isDividend ? null : row.fees,
        display: isDividend ? "N/A" : formatCurrency(row.fees),
      },
      netAmount: { value: netAmount, display: formatCurrency(netAmount) },
      netAvgPrice: { value: netAvgPrice, display: formatCurrency(netAvgPrice) },
      portfolio: row.portfolio,
      currency: row.currency,
    };
  });
}
