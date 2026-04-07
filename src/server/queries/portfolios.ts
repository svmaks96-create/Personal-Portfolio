import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";

/**
 * Get unique portfolio names from the transactions table, sorted alphabetically.
 */
export function getUniquePortfolios(): string[] {
  const rows = db
    .selectDistinct({ portfolio: transactions.portfolio })
    .from(transactions)
    .orderBy(transactions.portfolio)
    .all();

  return rows.map((r) => r.portfolio);
}
