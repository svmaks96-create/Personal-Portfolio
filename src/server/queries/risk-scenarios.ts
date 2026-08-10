import { cache } from "react";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { ScenarioWindow } from "@/server/services/risk/scenario-replay";

export const RISK_SCENARIOS_KEY = "risk_custom_scenarios";

/** User-defined replay windows, stored as JSON in app_settings. */
export const getCustomScenarios = cache((): ScenarioWindow[] => {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, RISK_SCENARIOS_KEY))
    .get();
  if (!row) return [];

  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is ScenarioWindow =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as ScenarioWindow).key === "string" &&
          typeof (entry as ScenarioWindow).label === "string" &&
          typeof (entry as ScenarioWindow).from === "string" &&
          typeof (entry as ScenarioWindow).to === "string"
      )
      .map((entry) => ({ ...entry, isCustom: true }));
  } catch {
    return [];
  }
});
