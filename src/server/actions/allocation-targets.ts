"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { allocationTargets } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  allocationTargetSchema,
  cashTargetWeightSchema,
  UPDATABLE_FIELDS,
  type AllocationKind,
  type UpdatableField,
} from "@/shared/schemas/allocation-target";
import type { ActionResult } from "@/server/types/action-result";
import { setCashTargetWeight } from "@/server/queries/app-settings";
import type { PolicyBucket } from "@/shared/policy";

interface CreateInput {
  kind: AllocationKind;
  name: string;
  bucket?: PolicyBucket | null;
  targetWeight: number;
  cashAmountUsd: number | null;
}

function zodIssuesToFieldErrors(
  issues: readonly { path: readonly PropertyKey[]; message: string }[],
): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : "_form";
    if (!fieldErrors[key]) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export async function createAllocationTarget(
  data: CreateInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const normalised = {
      ...data,
      bucket: data.kind === "ticker" ? (data.bucket ?? null) : null,
      cashAmountUsd: data.kind === "cash" ? data.cashAmountUsd : null,
    };

    const parsed = allocationTargetSchema.safeParse(normalised);
    if (!parsed.success) {
      const fieldErrors = zodIssuesToFieldErrors(parsed.error.issues);
      const firstError = Object.values(fieldErrors)[0];
      return {
        success: false,
        error: firstError ?? "Validation failed",
        fieldErrors,
      };
    }

    const validated = parsed.data;
    const now = new Date().toISOString();

    const maxSortRow = db
      .select({ sortOrder: allocationTargets.sortOrder })
      .from(allocationTargets)
      .orderBy(allocationTargets.sortOrder)
      .all()
      .reduce((max, r) => (r.sortOrder > max ? r.sortOrder : max), 0);

    try {
      const result = db
        .insert(allocationTargets)
        .values({
          kind: validated.kind,
          name: validated.name,
          bucket: validated.kind === "ticker" ? validated.bucket : null,
          targetWeight: validated.targetWeight,
          cashAmountUsd:
            validated.kind === "cash" ? validated.cashAmountUsd : null,
          sortOrder: maxSortRow + 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();

      revalidatePath("/", "layout");
      return { success: true, data: { id: Number(result.lastInsertRowid) } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE")) {
        return {
          success: false,
          error: `A ${validated.kind} row named "${validated.name}" already exists`,
          fieldErrors: { name: "Already exists" },
        };
      }
      throw err;
    }
  } catch (error) {
    console.error("createAllocationTarget failed:", error);
    return {
      success: false,
      error: "Failed to create allocation target. Please try again.",
    };
  }
}

export async function updateAllocationTarget(
  id: number,
  field: UpdatableField,
  value: string | number | null,
): Promise<ActionResult> {
  if (!(UPDATABLE_FIELDS as readonly string[]).includes(field)) {
    return { success: false, error: "Invalid field" };
  }

  try {
    const existing = db
      .select()
      .from(allocationTargets)
      .where(eq(allocationTargets.id, id))
      .get();

    if (!existing) {
      return { success: false, error: "Allocation row not found" };
    }

    const merged = {
      kind: existing.kind,
      name: existing.name,
      bucket: existing.bucket,
      targetWeight: existing.targetWeight,
      cashAmountUsd: existing.cashAmountUsd,
      [field]: value,
    };

    const parsed = allocationTargetSchema.safeParse(merged);
    if (!parsed.success) {
      const fieldErrors = zodIssuesToFieldErrors(parsed.error.issues);
      const firstError = Object.values(fieldErrors)[0];
      return {
        success: false,
        error: fieldErrors[field] ?? firstError ?? "Validation failed",
        fieldErrors,
      };
    }

    const validated = parsed.data;
    const now = new Date().toISOString();

    try {
      db.update(allocationTargets)
        .set({
          name: validated.name,
          bucket: validated.kind === "ticker" ? validated.bucket : null,
          targetWeight: validated.targetWeight,
          cashAmountUsd:
            validated.kind === "cash" ? validated.cashAmountUsd : null,
          updatedAt: now,
        })
        .where(eq(allocationTargets.id, id))
        .run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("UNIQUE")) {
        return {
          success: false,
          error: `A ${validated.kind} row named "${validated.name}" already exists`,
          fieldErrors: { name: "Already exists" },
        };
      }
      throw err;
    }

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("updateAllocationTarget failed:", error);
    return {
      success: false,
      error: "Failed to update allocation row. Please try again.",
    };
  }
}

export async function updateCashTargetWeight(
  value: number,
): Promise<ActionResult> {
  const parsed = cashTargetWeightSchema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid target weight";
    return { success: false, error: message };
  }

  try {
    setCashTargetWeight(parsed.data);
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("updateCashTargetWeight failed:", error);
    return {
      success: false,
      error: "Failed to update cash target weight. Please try again.",
    };
  }
}

export async function deleteAllocationTarget(
  id: number,
): Promise<ActionResult> {
  if (!Number.isInteger(id) || id <= 0) {
    return { success: false, error: "Invalid row ID" };
  }

  try {
    const existing = db
      .select()
      .from(allocationTargets)
      .where(eq(allocationTargets.id, id))
      .get();

    if (!existing) {
      return { success: false, error: "Allocation row not found" };
    }

    db.delete(allocationTargets).where(eq(allocationTargets.id, id)).run();

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteAllocationTarget failed:", error);
    return {
      success: false,
      error: "Failed to delete allocation row. Please try again.",
    };
  }
}
