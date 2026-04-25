import { cache } from "react";
import { db } from "@/server/db";
import { allocationTargets, appSettings } from "@/server/db/schema";
import { eq } from "drizzle-orm";

const CASH_TARGET_KEY = "cash_target_weight";

export const getCashTargetWeight = cache((): number => {
  const existing = db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, CASH_TARGET_KEY))
    .get();

  if (existing) {
    const parsed = Number(existing.value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  // Lazy backfill: sum existing per-row cash target weights from the legacy
  // model into the new aggregate setting on first read.
  const cashRows = db
    .select({ targetWeight: allocationTargets.targetWeight })
    .from(allocationTargets)
    .where(eq(allocationTargets.kind, "cash"))
    .all();

  const initial = cashRows.reduce((sum, r) => sum + r.targetWeight, 0);
  const now = new Date().toISOString();

  db.insert(appSettings)
    .values({ key: CASH_TARGET_KEY, value: String(initial), updatedAt: now })
    .onConflictDoNothing()
    .run();

  return initial;
});

export function setCashTargetWeight(value: number): void {
  const now = new Date().toISOString();
  db.insert(appSettings)
    .values({ key: CASH_TARGET_KEY, value: String(value), updatedAt: now })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: String(value), updatedAt: now },
    })
    .run();
}
