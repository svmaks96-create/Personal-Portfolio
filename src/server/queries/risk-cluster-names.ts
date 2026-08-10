import { cache } from "react";
import { db } from "@/server/db";
import { appSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import type { StoredClusterName } from "@/server/services/risk/clustering";

export const RISK_CLUSTER_NAMES_KEY = "risk_cluster_names";

/**
 * User-assigned cluster labels, stored as JSON in app_settings. These are
 * user input, not derived data — the clusters themselves are always
 * recomputed; only the names persist.
 */
export const getRiskClusterNames = cache((): StoredClusterName[] => {
  const row = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, RISK_CLUSTER_NAMES_KEY))
    .get();
  if (!row) return [];

  try {
    const parsed: unknown = JSON.parse(row.value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredClusterName =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as StoredClusterName).name === "string" &&
        Array.isArray((entry as StoredClusterName).members) &&
        (entry as StoredClusterName).members.every((m) => typeof m === "string")
    );
  } catch {
    return [];
  }
});
