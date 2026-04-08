"use server";

import { revalidatePath } from "next/cache";
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
