import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { count } from "drizzle-orm";

export function getTransactionCount(): number {
  const result = db.select({ count: count() }).from(transactions).get();
  return result?.count ?? 0;
}
