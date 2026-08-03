import { z } from "zod";

/**
 * Analysis window for the decision-analytics surfaces.
 *
 * Inception-to-date spans a period when the book was a few thousand dollars, so
 * a -24% year there carries the same weight in a chain-linked return as a good
 * year on a six-figure book. That makes the ITD figures a poor description of
 * how the portfolio is actually run, which is why the default starts in 2024.
 *
 * The window only ever moves where *measurement* begins. Share counts and cost
 * bases are always walked from the first transaction, or the opening positions
 * would be wrong.
 */
export const ANALYTICS_WINDOWS = ["ITD", "2024+", "2025+"] as const;

export type AnalyticsWindow = (typeof ANALYTICS_WINDOWS)[number];

export const DEFAULT_ANALYTICS_WINDOW: AnalyticsWindow = "2024+";

export const analyticsWindowSchema = z.enum(ANALYTICS_WINDOWS);

/** Inclusive start date, or undefined for inception-to-date. */
export function windowStartDate(window: AnalyticsWindow): string | undefined {
  switch (window) {
    case "2024+":
      return "2024-01-01";
    case "2025+":
      return "2025-01-01";
    case "ITD":
      return undefined;
  }
}

/** Short human label describing what the window covers. */
export function windowLabel(window: AnalyticsWindow): string {
  switch (window) {
    case "2024+":
      return "Since 2024";
    case "2025+":
      return "Since 2025";
    case "ITD":
      return "Inception to date";
  }
}
