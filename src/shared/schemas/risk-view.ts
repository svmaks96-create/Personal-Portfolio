import { z } from "zod";

/**
 * View state for the risk-engineering page: which slice of the book is being
 * measured, and over what estimation period.
 *
 * The universe split follows how the portfolio is actually run — a broad-ETF
 * core sleeve and a single-stock picking sleeve — so each can be examined as
 * its own book, or combined. Options and cash are never part of a universe:
 * options have no reliable daily marks and cash is not in the ledger. Their
 * excluded weight is disclosed on the page instead.
 *
 * The window sets where *measurement* begins (returns, correlations,
 * regressions). Like the analytics window, it never moves position walks —
 * current weights are always current.
 */

export const RISK_UNIVERSES = ["all", "stocks", "etfs"] as const;

export type RiskUniverse = (typeof RISK_UNIVERSES)[number];

export const DEFAULT_RISK_UNIVERSE: RiskUniverse = "all";

export const riskUniverseSchema = z.enum(RISK_UNIVERSES);

export function universeLabel(universe: RiskUniverse): string {
  switch (universe) {
    case "all":
      return "Whole portfolio";
    case "stocks":
      return "Single stocks";
    case "etfs":
      return "Core ETFs";
  }
}

export const RISK_WINDOWS = ["ITD", "2023+", "2024+", "2025+"] as const;

export type RiskWindow = (typeof RISK_WINDOWS)[number];

/**
 * Defaults to 2024+ for the same reason the analytics page does: ITD reaches
 * back to a book a fraction of today's size, which distorts portfolio-level
 * return series. Estimation-window trade-offs are shown on the page itself.
 */
export const DEFAULT_RISK_WINDOW: RiskWindow = "2024+";

export const riskWindowSchema = z.enum(RISK_WINDOWS);

/** Inclusive start date, or undefined for inception-to-date. */
export function riskWindowStartDate(window: RiskWindow): string | undefined {
  switch (window) {
    case "2023+":
      return "2023-01-01";
    case "2024+":
      return "2024-01-01";
    case "2025+":
      return "2025-01-01";
    case "ITD":
      return undefined;
  }
}

export function riskWindowLabel(window: RiskWindow): string {
  switch (window) {
    case "2023+":
      return "Since 2023";
    case "2024+":
      return "Since 2024";
    case "2025+":
      return "Since 2025";
    case "ITD":
      return "Inception to date";
  }
}
