import { z } from "zod";
import { POLICY_BUCKETS, THESIS_HORIZON_YEARS } from "@/shared/policy";

export const bucketSchema = z.enum(POLICY_BUCKETS);

export const THESIS_STATUSES = [
  "draft",
  "final",
  "superseded",
  "rejected",
] as const;
export type ThesisStatus = (typeof THESIS_STATUSES)[number];

export const THESIS_SOURCES = [
  "portfolio_review",
  "underwrite_name",
  "manual",
] as const;
export type ThesisSource = (typeof THESIS_SOURCES)[number];

export const ADD_DOWN_STATES = ["available", "used", "void"] as const;
export type AddDownState = (typeof ADD_DOWN_STATES)[number];

export const KEEP_DECISIONS = ["keep", "cut"] as const;

const HORIZON_MIN_MONTHS = THESIS_HORIZON_YEARS.min * 12;
const HORIZON_MAX_MONTHS = THESIS_HORIZON_YEARS.max * 12;

const scoreSchema = z
  .number()
  .int("Must be a whole number")
  .min(1, "Score range is 1–5")
  .max(5, "Score range is 1–5");

/** 2–4 falsifiable statements; any one verified true ⇒ full exit. */
export const breakConditionsSchema = z
  .array(z.string().trim().min(1, "Break condition cannot be empty"))
  .min(2, "At least 2 break conditions required")
  .max(4, "At most 4 break conditions");

/**
 * Nullable price levels; a level set to null clears it. Applied both at
 * finalize (edits) and by updatePriceLevels (new version cloning current).
 */
export const priceLevelsSchema = z
  .object({
    entryZoneLow: z.number().positive("Must be a positive price").nullable(),
    entryZoneHigh: z.number().positive("Must be a positive price").nullable(),
    entryNote: z.string().trim().nullable(),
    addLevel: z.number().positive("Must be a positive price").nullable(),
    addMaxSizePct: z
      .number()
      .positive("Must be a positive % of book")
      .max(100)
      .nullable(),
    addNote: z.string().trim().nullable(),
    technicalBackstop: z
      .number()
      .positive("Must be a positive price")
      .nullable(),
    backstopNote: z.string().trim().nullable(),
  })
  .refine(
    (v) =>
      v.entryZoneLow === null ||
      v.entryZoneHigh === null ||
      v.entryZoneLow <= v.entryZoneHigh,
    {
      message: "Entry zone low must not exceed entry zone high",
      path: ["entryZoneLow"],
    },
  );

export type PriceLevelsInput = z.infer<typeof priceLevelsSchema>;

/**
 * Shape of a thesis draft as written by skills / read by the review queue.
 * Core rows carry no scores, levels, break conditions, or horizon.
 */
export const thesisDraftSchema = z.object({
  ticker: z
    .string()
    .trim()
    .min(1, "Ticker is required")
    .transform((v) => v.toUpperCase()),
  bucket: bucketSchema,
  sector: z.string().trim().nullable(),
  conviction: scoreSchema.nullable(),
  promiseRank: scoreSchema.nullable(),
  keepDecision: z.enum(KEEP_DECISIONS).nullable(),
  thesis: z.string().trim().nullable(),
  keyRisk: z.string().trim().nullable(),
  catalyst: z.string().trim().nullable(),
  breakConditions: breakConditionsSchema.nullable(),
  horizonMonths: z
    .number()
    .int()
    .min(HORIZON_MIN_MONTHS, `Horizon range is ${HORIZON_MIN_MONTHS}–${HORIZON_MAX_MONTHS} months`)
    .max(HORIZON_MAX_MONTHS, `Horizon range is ${HORIZON_MIN_MONTHS}–${HORIZON_MAX_MONTHS} months`)
    .nullable(),
  source: z.enum(THESIS_SOURCES),
  changeReason: z.string().trim().nullable(),
  critiqueVerdict: z.enum(["survives", "overturned"]).nullable(),
  critiqueCounter: z.string().trim().nullable(),
});

/**
 * Maksim's finalize edits — he owns the final scores. Active theses must be
 * fully underwritten (scores, keep decision, horizon, break conditions); core
 * rows must stay opinion-free, enforced by the superRefine below.
 */
export const finalizeThesisSchema = z
  .object({
    bucket: bucketSchema,
    sector: z.string().trim().nullable(),
    conviction: scoreSchema.nullable(),
    promiseRank: scoreSchema.nullable(),
    keepDecision: z.enum(KEEP_DECISIONS).nullable(),
    /** Override for the ladder-derived value; null = derive from conviction. */
    targetWeightPct: z.number().min(0).max(100).nullable(),
    thesis: z.string().trim().nullable(),
    keyRisk: z.string().trim().nullable(),
    catalyst: z.string().trim().nullable(),
    breakConditions: breakConditionsSchema.nullable(),
    horizonMonths: z
      .number()
      .int()
      .min(HORIZON_MIN_MONTHS, `Horizon range is ${HORIZON_MIN_MONTHS}–${HORIZON_MAX_MONTHS} months`)
      .max(HORIZON_MAX_MONTHS, `Horizon range is ${HORIZON_MIN_MONTHS}–${HORIZON_MAX_MONTHS} months`)
      .nullable(),
    levels: priceLevelsSchema,
    /** Required on version > 1 — enforced in the action, which knows the version. */
    changeReason: z.string().trim().nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.bucket === "active") {
      if (v.conviction === null) {
        ctx.addIssue({
          code: "custom",
          path: ["conviction"],
          message: "Active theses require a conviction score",
        });
      }
      if (v.promiseRank === null) {
        ctx.addIssue({
          code: "custom",
          path: ["promiseRank"],
          message: "Active theses require a promise rank",
        });
      }
      if (v.keepDecision === null) {
        ctx.addIssue({
          code: "custom",
          path: ["keepDecision"],
          message: "Active theses require a keep/cut decision",
        });
      }
      if (v.keepDecision === "keep" && v.horizonMonths === null) {
        ctx.addIssue({
          code: "custom",
          path: ["horizonMonths"],
          message: "Keep decisions require a thesis horizon",
        });
      }
      if (v.keepDecision === "keep" && v.breakConditions === null) {
        ctx.addIssue({
          code: "custom",
          path: ["breakConditions"],
          message: "Keep decisions require break conditions",
        });
      }
    } else {
      // Core carries no opinions: no scores, no levels, no horizon.
      if (
        v.conviction !== null ||
        v.promiseRank !== null ||
        v.horizonMonths !== null ||
        v.breakConditions !== null
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["bucket"],
          message:
            "Core rows carry no scores, break conditions, or horizon (no opinions in the Engine)",
        });
      }
    }
  });

export type FinalizeThesisInput = z.infer<typeof finalizeThesisSchema>;
export type ThesisDraftInput = z.infer<typeof thesisDraftSchema>;

/** Parse the DB's JSON text column into a string array (null-safe). */
export function parseBreakConditions(raw: string | null): string[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === "string");
    }
    return [];
  } catch {
    return [];
  }
}
