"use server";

import { revalidatePath } from "next/cache";
import { addMonths } from "date-fns";
import Decimal from "decimal.js";
import { db } from "@/server/db";
import { positionTheses, allocationTargets } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import {
  finalizeThesisSchema,
  priceLevelsSchema,
  ADD_DOWN_STATES,
  type AddDownState,
  type FinalizeThesisInput,
  type PriceLevelsInput,
} from "@/shared/schemas/position-thesis";
import {
  deriveTargetWeight,
  reconcileActiveTargets,
  NAME_COUNTS,
} from "@/shared/policy";
import {
  getCashTargetWeight,
  setCashTargetWeight,
} from "@/server/queries/app-settings";
import type { ActionResult } from "@/server/types/action-result";

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

function getDraftById(draftId: number) {
  return db
    .select()
    .from(positionTheses)
    .where(eq(positionTheses.id, draftId))
    .get();
}

function getCurrentFinal(ticker: string) {
  return db
    .select()
    .from(positionTheses)
    .where(
      and(
        eq(positionTheses.ticker, ticker),
        eq(positionTheses.status, "final"),
        eq(positionTheses.isCurrent, true),
      ),
    )
    .get();
}

/**
 * The single path from draft to final (the skills contract prohibits skills
 * from ever writing status='final'). One transaction: apply Maksim's edits,
 * derive/override the ladder weight, stamp reviewed_at + expires_at, flip the
 * prior current final to superseded.
 */
export async function finalizeThesis(
  draftId: number,
  edits: FinalizeThesisInput,
): Promise<ActionResult> {
  try {
    const parsed = finalizeThesisSchema.safeParse(edits);
    if (!parsed.success) {
      const fieldErrors = zodIssuesToFieldErrors(parsed.error.issues);
      const firstError = Object.values(fieldErrors)[0];
      return {
        success: false,
        error: firstError ?? "Validation failed",
        fieldErrors,
      };
    }
    const v = parsed.data;

    const draft = getDraftById(draftId);
    if (!draft) {
      return { success: false, error: "Draft not found" };
    }
    if (draft.status !== "draft") {
      return {
        success: false,
        error: `Row ${draftId} is ${draft.status}, not a draft`,
      };
    }

    if (draft.version > 1 && (v.changeReason === null || v.changeReason === "")) {
      return {
        success: false,
        error: "A change reason is required on every re-underwrite",
        fieldErrors: { changeReason: "Required on version > 1" },
      };
    }

    // A new name entering a full sleeve admits only by displacement — the
    // change reason must name the displaced incumbent (IPS admission rules).
    if (
      draft.version === 1 &&
      v.bucket === "active" &&
      v.keepDecision === "keep"
    ) {
      const incumbents = db
        .select()
        .from(positionTheses)
        .where(
          and(
            eq(positionTheses.status, "final"),
            eq(positionTheses.isCurrent, true),
            eq(positionTheses.bucket, "active"),
          ),
        )
        .all()
        .filter(
          (t) => t.keepDecision === "keep" && t.ticker !== draft.ticker,
        );
      if (
        incumbents.length >= NAME_COUNTS.active.max &&
        (v.changeReason === null || v.changeReason === "")
      ) {
        return {
          success: false,
          error: `Active sleeve is full (${incumbents.length} names) — the change reason must name the displaced incumbent`,
          fieldErrors: { changeReason: "Name the displaced incumbent" },
        };
      }
    }

    const conviction = v.conviction;
    const targetWeightPct =
      v.targetWeightPct !== null
        ? v.targetWeightPct
        : conviction !== null
          ? deriveTargetWeight(v.bucket, conviction, {
              keepDecision: v.keepDecision ?? undefined,
            })
          : null;

    const now = new Date();
    const reviewedAt = now.toISOString();
    const expiresAt =
      v.bucket === "active" &&
      v.keepDecision === "keep" &&
      v.horizonMonths !== null
        ? addMonths(now, v.horizonMonths).toISOString()
        : null;

    db.transaction((tx) => {
      const prior = getCurrentFinal(draft.ticker);
      if (prior && prior.id !== draft.id) {
        tx.update(positionTheses)
          .set({ status: "superseded", isCurrent: false })
          .where(eq(positionTheses.id, prior.id))
          .run();
      }
      tx.update(positionTheses)
        .set({
          bucket: v.bucket,
          sector: v.sector,
          conviction: v.conviction,
          promiseRank: v.promiseRank,
          keepDecision: v.keepDecision,
          targetWeightPct,
          thesis: v.thesis,
          keyRisk: v.keyRisk,
          catalyst: v.catalyst,
          breakConditions:
            v.breakConditions === null ? null : JSON.stringify(v.breakConditions),
          horizonMonths: v.horizonMonths,
          expiresAt,
          entryZoneLow: v.levels.entryZoneLow,
          entryZoneHigh: v.levels.entryZoneHigh,
          entryNote: v.levels.entryNote,
          addLevel: v.levels.addLevel,
          addMaxSizePct: v.levels.addMaxSizePct,
          addNote: v.levels.addNote,
          technicalBackstop: v.levels.technicalBackstop,
          backstopNote: v.levels.backstopNote,
          changeReason: v.changeReason,
          status: "final",
          isCurrent: true,
          reviewedAt,
        })
        .where(eq(positionTheses.id, draft.id))
        .run();
    });

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("finalizeThesis failed:", error);
    return {
      success: false,
      error: "Failed to finalize thesis. Please try again.",
    };
  }
}

export async function rejectDraft(
  draftId: number,
  reason: string,
): Promise<ActionResult> {
  try {
    if (reason.trim() === "") {
      return { success: false, error: "A rejection reason is required" };
    }
    const draft = getDraftById(draftId);
    if (!draft) {
      return { success: false, error: "Draft not found" };
    }
    if (draft.status !== "draft") {
      return {
        success: false,
        error: `Row ${draftId} is ${draft.status}, not a draft`,
      };
    }

    db.update(positionTheses)
      .set({ status: "rejected", isCurrent: false, changeReason: reason.trim() })
      .where(eq(positionTheses.id, draftId))
      .run();

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("rejectDraft failed:", error);
    return { success: false, error: "Failed to reject draft. Please try again." };
  }
}

/**
 * Appends a new version cloning the current final with new levels — same
 * underwriting act as a thesis change, so versioning gives level history for
 * free. reviewed_at / expires_at carry over: a level tweak is not a
 * re-underwrite and must not reset the cooling period or the horizon clock.
 */
export async function updatePriceLevels(
  ticker: string,
  levels: PriceLevelsInput,
  changeReason: string,
): Promise<ActionResult> {
  try {
    const parsed = priceLevelsSchema.safeParse(levels);
    if (!parsed.success) {
      const fieldErrors = zodIssuesToFieldErrors(parsed.error.issues);
      const firstError = Object.values(fieldErrors)[0];
      return {
        success: false,
        error: firstError ?? "Validation failed",
        fieldErrors,
      };
    }
    if (changeReason.trim() === "") {
      return {
        success: false,
        error: "A change reason is required on every new version",
        fieldErrors: { changeReason: "Required" },
      };
    }

    const current = getCurrentFinal(ticker.toUpperCase());
    if (!current) {
      return {
        success: false,
        error: `No current final thesis for ${ticker.toUpperCase()}`,
      };
    }

    const lv = parsed.data;
    const now = new Date().toISOString();
    const { id: _priorId, ...clone } = current;
    void _priorId;

    db.transaction((tx) => {
      tx.update(positionTheses)
        .set({ status: "superseded", isCurrent: false })
        .where(eq(positionTheses.id, current.id))
        .run();
      tx.insert(positionTheses)
        .values({
          ...clone,
          version: current.version + 1,
          entryZoneLow: lv.entryZoneLow,
          entryZoneHigh: lv.entryZoneHigh,
          entryNote: lv.entryNote,
          addLevel: lv.addLevel,
          addMaxSizePct: lv.addMaxSizePct,
          addNote: lv.addNote,
          technicalBackstop: lv.technicalBackstop,
          backstopNote: lv.backstopNote,
          changeReason: changeReason.trim(),
          source: "manual",
          status: "final",
          isCurrent: true,
          createdAt: now,
        })
        .run();
    });

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("updatePriceLevels failed:", error);
    return {
      success: false,
      error: "Failed to update price levels. Please try again.",
    };
  }
}

/**
 * The only writer of add_down_state (trades happen in IBKR; this is the manual
 * bookkeeping act). Legal transitions: available → used (add executed) and
 * available → void (thesis-relevant bad news). Re-arming requires a new
 * underwriting version, never a state flip.
 */
export async function setAddDownState(
  ticker: string,
  state: AddDownState,
  reason?: string,
): Promise<ActionResult> {
  try {
    if (!ADD_DOWN_STATES.includes(state)) {
      return { success: false, error: "Invalid add-down state" };
    }
    const current = getCurrentFinal(ticker.toUpperCase());
    if (!current) {
      return {
        success: false,
        error: `No current final thesis for ${ticker.toUpperCase()}`,
      };
    }
    if (current.addDownState !== "available") {
      return {
        success: false,
        error: `Add-down is already ${current.addDownState} — re-arming requires a new underwriting version`,
      };
    }
    if (state === "available") {
      return { success: false, error: "Add-down is already available" };
    }

    const note = reason?.trim();
    const today = new Date().toISOString().slice(0, 10);
    const addNote = note
      ? `${current.addNote ?? ""}${current.addNote ? "\n" : ""}[${state} ${today}] ${note}`
      : current.addNote;

    db.update(positionTheses)
      .set({ addDownState: state, addNote })
      .where(eq(positionTheses.id, current.id))
      .run();

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("setAddDownState failed:", error);
    return {
      success: false,
      error: "Failed to update add-down state. Please try again.",
    };
  }
}

/**
 * The only automated path that touches allocation weights: writes this name's
 * target from its thesis ladder value (post-reconcileActiveTargets across all
 * current finals), moves the residual into the cash target so Σ ticker
 * weights + cash stays 100. The cash residual is bookkeeping — the IPS routes
 * real remainders to the Engine; /construction's cash-band violation surfaces
 * the difference.
 */
export async function applyTargetToAllocation(
  ticker: string,
): Promise<ActionResult> {
  try {
    const upper = ticker.toUpperCase();
    const thesis = getCurrentFinal(upper);
    if (!thesis) {
      return { success: false, error: `No current final thesis for ${upper}` };
    }
    if (thesis.bucket !== "active") {
      return {
        success: false,
        error:
          "Only active-sleeve theses carry ladder weights — core targets are band-rebalanced on /allocation",
      };
    }
    if (thesis.targetWeightPct === null) {
      return {
        success: false,
        error: `${upper} has no ladder weight (conviction below 3 or no override)`,
      };
    }

    // Reconcile across ALL active current finals — the 35% bucket binds.
    const activeFinals = db
      .select()
      .from(positionTheses)
      .where(
        and(
          eq(positionTheses.status, "final"),
          eq(positionTheses.isCurrent, true),
          eq(positionTheses.bucket, "active"),
        ),
      )
      .all()
      .filter((t) => t.targetWeightPct !== null);
    const reconciled = reconcileActiveTargets(
      activeFinals.map((t) => t.targetWeightPct as number),
    );
    const idx = activeFinals.findIndex((t) => t.ticker === upper);
    const newWeight = idx === -1 ? thesis.targetWeightPct : reconciled[idx];

    const existing = db
      .select()
      .from(allocationTargets)
      .where(
        and(
          eq(allocationTargets.kind, "ticker"),
          eq(allocationTargets.name, upper),
        ),
      )
      .get();
    const oldWeight = existing?.targetWeight ?? 0;

    const cashBefore = getCashTargetWeight();
    const cashAfter = new Decimal(cashBefore)
      .minus(new Decimal(newWeight).minus(oldWeight))
      .toDecimalPlaces(2)
      .toNumber();
    if (cashAfter < 0) {
      return {
        success: false,
        error: `Applying ${newWeight}% to ${upper} would push the cash target to ${cashAfter}% — reconcile other targets first`,
      };
    }

    const now = new Date().toISOString();
    if (existing) {
      db.update(allocationTargets)
        .set({ targetWeight: newWeight, bucket: thesis.bucket, updatedAt: now })
        .where(eq(allocationTargets.id, existing.id))
        .run();
    } else {
      const maxSortRow = db
        .select({ sortOrder: allocationTargets.sortOrder })
        .from(allocationTargets)
        .all()
        .reduce((max, r) => (r.sortOrder > max ? r.sortOrder : max), 0);
      db.insert(allocationTargets)
        .values({
          kind: "ticker",
          name: upper,
          bucket: thesis.bucket,
          targetWeight: newWeight,
          cashAmountUsd: null,
          sortOrder: maxSortRow + 1,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    setCashTargetWeight(cashAfter);

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("applyTargetToAllocation failed:", error);
    return {
      success: false,
      error: "Failed to apply target to allocation. Please try again.",
    };
  }
}
