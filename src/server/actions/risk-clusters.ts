"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  riskClusterNameSchema,
  type RiskClusterNameInput,
} from "@/shared/schemas/risk-cluster";
import { RISK_CLUSTER_NAMES_KEY } from "@/server/queries/risk-cluster-names";
import type { StoredClusterName } from "@/server/services/risk/clustering";
import type { ActionResult } from "@/server/types/action-result";

function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const m of setA) if (setB.has(m)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Save (or clear, when name is empty) the label for a cluster identified by
 * its member set. Any stored label whose members substantially overlap the
 * new set is replaced — a renamed cluster should not leave its old label
 * behind to be matched later.
 */
export async function saveRiskClusterName(
  input: RiskClusterNameInput
): Promise<ActionResult> {
  const parsed = riskClusterNameSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid cluster name",
    };
  }
  const { name, members } = parsed.data;

  try {
    const row = db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, RISK_CLUSTER_NAMES_KEY))
      .get();

    let stored: StoredClusterName[] = [];
    if (row) {
      try {
        const existing: unknown = JSON.parse(row.value);
        if (Array.isArray(existing)) stored = existing as StoredClusterName[];
      } catch {
        stored = [];
      }
    }

    const kept = stored.filter((entry) => jaccard(entry.members, members) <= 0.5);
    if (name.length > 0) {
      kept.push({ name, members: [...members].sort() });
    }

    const now = new Date().toISOString();
    const value = JSON.stringify(kept);
    db.insert(appSettings)
      .values({ key: RISK_CLUSTER_NAMES_KEY, value, updatedAt: now })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value, updatedAt: now },
      })
      .run();

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("saveRiskClusterName failed:", error);
    return { success: false, error: "Failed to save cluster name. Please try again." };
  }
}
