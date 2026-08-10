"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import {
  riskScenarioSchema,
  type RiskScenarioInput,
} from "@/shared/schemas/risk-scenario";
import { RISK_SCENARIOS_KEY } from "@/server/queries/risk-scenarios";
import type { ScenarioWindow } from "@/server/services/risk/scenario-replay";
import type { ActionResult } from "@/server/types/action-result";

function readStored(): ScenarioWindow[] {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, RISK_SCENARIOS_KEY))
    .get();
  if (!row) return [];
  try {
    const parsed: unknown = JSON.parse(row.value);
    return Array.isArray(parsed) ? (parsed as ScenarioWindow[]) : [];
  } catch {
    return [];
  }
}

function write(scenarios: ScenarioWindow[]): void {
  const now = new Date().toISOString();
  const value = JSON.stringify(scenarios);
  db.insert(appSettings)
    .values({ key: RISK_SCENARIOS_KEY, value, updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: now },
    })
    .run();
}

export async function saveRiskScenario(
  input: RiskScenarioInput
): Promise<ActionResult> {
  const parsed = riskScenarioSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid scenario window",
    };
  }
  const { label, from, to } = parsed.data;

  try {
    const slug = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const key = `custom-${slug || "window"}`;
    const stored = readStored().filter((s) => s.key !== key);
    stored.push({ key, label, from, to, isCustom: true });
    write(stored);
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("saveRiskScenario failed:", error);
    return { success: false, error: "Failed to save the window. Please try again." };
  }
}

export async function deleteRiskScenario(key: string): Promise<ActionResult> {
  if (typeof key !== "string" || !key.startsWith("custom-")) {
    return { success: false, error: "Only custom windows can be removed." };
  }
  try {
    write(readStored().filter((s) => s.key !== key));
    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("deleteRiskScenario failed:", error);
    return { success: false, error: "Failed to remove the window. Please try again." };
  }
}
