import { z } from "zod";

export const WATCHLIST_STATUSES = [
  "candidate",
  "flagged_for_research",
  "researched",
  "watchlisted",
  "rejected",
] as const;
export type WatchlistStatus = (typeof WATCHLIST_STATUSES)[number];

/**
 * Legal status transitions for UI actions. `researched` is written only by
 * skills (in the same transaction as a draft insert) and `watchlisted` /
 * `rejected` also arrive via the /research finalize & reject actions.
 */
export const WATCHLIST_TRANSITIONS: Record<WatchlistStatus, WatchlistStatus[]> = {
  candidate: ["flagged_for_research", "rejected"],
  flagged_for_research: ["candidate", "researched", "rejected"],
  researched: ["watchlisted", "rejected"],
  watchlisted: ["flagged_for_research", "rejected"],
  rejected: ["flagged_for_research", "candidate"],
};

/** FMP company-screener sector taxonomy — exact strings the API expects. */
export const SCREENING_SECTORS = [
  "Basic Materials",
  "Communication Services",
  "Consumer Cyclical",
  "Consumer Defensive",
  "Energy",
  "Financial Services",
  "Healthcare",
  "Industrials",
  "Real Estate",
  "Technology",
  "Utilities",
] as const;
export type ScreeningSector = (typeof SCREENING_SECTORS)[number];

/**
 * Screener criteria. The mcap BAND (floor + optional ceiling) is the primary
 * universe control; `limit` is only a safety cap — a run where it binds is
 * flagged as truncated. Defaults: $2B floor, no ceiling, vol ≥ 500k, cap 1000.
 */
export const screeningCriteriaSchema = z
  .object({
    marketCapMoreThan: z
      .number()
      .min(0, "Market-cap floor cannot be negative")
      .default(2_000_000_000),
    marketCapLowerThan: z
      .number()
      .positive("Market-cap ceiling must be positive")
      .nullable()
      .default(null),
    volumeMoreThan: z
      .number()
      .min(0, "Volume floor cannot be negative")
      .default(500_000),
    sector: z.enum(SCREENING_SECTORS).nullable().default(null),
    limit: z
      .number()
      .int()
      .min(1, "Cap must be at least 1")
      .max(1000, "Cap at most 1000 — runScreen is a long server action")
      .default(1000),
  })
  .refine(
    (c) =>
      c.marketCapLowerThan === null || c.marketCapLowerThan > c.marketCapMoreThan,
    { message: "Market-cap ceiling must be above the floor" },
  );

export type ScreeningCriteria = z.infer<typeof screeningCriteriaSchema>;
export type ScreeningCriteriaInput = z.input<typeof screeningCriteriaSchema>;
