"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { transactionSchema } from "@/shared/schemas/transaction";
import type { ActionResult } from "@/server/types/action-result";

const EDITABLE_FIELDS = [
  "date", "ticker", "action", "quantity", "grossAmount", "fees", "portfolio", "currency",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

export async function updateTransaction(
  id: number,
  field: EditableField,
  value: string | number,
): Promise<ActionResult> {
  if (!(EDITABLE_FIELDS as readonly string[]).includes(field)) {
    return { success: false, error: "Invalid field" };
  }

  try {
    const existing = db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();

    if (!existing) {
      return { success: false, error: "Transaction not found" };
    }

    const merged = { ...existing, [field]: value };

    const result = transactionSchema.safeParse(merged);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join(".");
        fieldErrors[path] = issue.message;
      }
      const firstError = Object.values(fieldErrors)[0];
      return {
        success: false,
        error: fieldErrors[field] ?? firstError ?? "Validation failed",
        fieldErrors,
      };
    }

    db.update(transactions)
      .set({ [field]: result.data[field as keyof typeof result.data] })
      .where(eq(transactions.id, id))
      .run();

    revalidatePath("/", "layout");

    return { success: true, data: undefined };
  } catch (error) {
    console.error("updateTransaction failed:", error);
    return {
      success: false,
      error: "Failed to update transaction. Please try again.",
    };
  }
}

export async function addTransaction(
  data: {
    date: string;
    ticker: string;
    action: string;
    quantity: number;
    grossAmount: number;
    fees: number;
    portfolio: string;
    currency: string;
  },
  overrideDuplicate = false,
): Promise<ActionResult<{ id: number }>> {
  try {
    // 1. Validate with Zod
    const parsed = transactionSchema.safeParse(data);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        fieldErrors[path] = issue.message;
      }
      const firstError = Object.values(fieldErrors)[0];
      return {
        success: false,
        error: firstError ?? "Validation failed",
        fieldErrors,
      };
    }

    const validated = parsed.data;

    // 2. Sell-more-than-held check (reuses logic from import.ts checkSellMoreThanHeld)
    if (validated.action === "sell") {
      const existingTxs = db
        .select({
          ticker: transactions.ticker,
          portfolio: transactions.portfolio,
          action: transactions.action,
          quantity: transactions.quantity,
        })
        .from(transactions)
        .all();

      let held = new Decimal(0);
      for (const tx of existingTxs) {
        if (tx.ticker === validated.ticker && tx.portfolio === validated.portfolio) {
          if (tx.action === "buy") held = held.plus(tx.quantity);
          if (tx.action === "sell") held = held.minus(tx.quantity);
        }
      }

      if (new Decimal(validated.quantity).greaterThan(held)) {
        return {
          success: false,
          error: `Cannot sell more than held (have ${held.toNumber()}, selling ${validated.quantity})`,
          fieldErrors: {
            quantity: `Cannot sell more than held (have ${held.toNumber()}, selling ${validated.quantity})`,
          },
        };
      }
    }

    // 3. Duplicate detection (reuses logic from import.ts checkDuplicates)
    if (!overrideDuplicate) {
      const existingTxs = db
        .select({
          id: transactions.id,
          date: transactions.date,
          ticker: transactions.ticker,
          action: transactions.action,
          quantity: transactions.quantity,
          grossAmount: transactions.grossAmount,
          portfolio: transactions.portfolio,
        })
        .from(transactions)
        .all();

      const newKey = `${validated.date}|${validated.ticker}|${validated.action}|${validated.quantity}|${validated.grossAmount}|${validated.portfolio}`;

      for (const tx of existingTxs) {
        const existingKey = `${tx.date}|${tx.ticker}|${tx.action}|${tx.quantity}|${tx.grossAmount}|${tx.portfolio}`;
        if (existingKey === newKey) {
          return {
            success: false,
            error: "Duplicate transaction detected",
          };
        }
      }
    }

    // 4. Insert
    const result = db
      .insert(transactions)
      .values({
        date: validated.date,
        ticker: validated.ticker,
        action: validated.action,
        quantity: validated.quantity,
        grossAmount: validated.grossAmount,
        fees: validated.fees,
        portfolio: validated.portfolio,
        currency: validated.currency,
      })
      .run();

    revalidatePath("/", "layout");

    return { success: true, data: { id: Number(result.lastInsertRowid) } };
  } catch (error) {
    console.error("addTransaction failed:", error);
    return {
      success: false,
      error: "Failed to add transaction. Please try again.",
    };
  }
}
