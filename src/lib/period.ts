import { format, startOfYear, subDays, subMonths, subYears } from "date-fns";
import type { Period } from "@/shared/schemas/period";

/**
 * Returns the yyyy-MM-dd start date for `period`, clamped to `inception` so
 * sub-windows that predate the first transaction silently behave like ITD.
 */
export function resolvePeriodStart(
  period: Period,
  today: Date,
  inception: string,
): string {
  const raw = (() => {
    switch (period) {
      case "1W":
        return subDays(today, 7);
      case "1M":
        return subMonths(today, 1);
      case "YTD":
        return startOfYear(today);
      case "1Y":
        return subYears(today, 1);
      case "3Y":
        return subYears(today, 3);
      case "ITD":
        return null;
    }
  })();
  if (raw === null) return inception;
  const candidate = format(raw, "yyyy-MM-dd");
  return candidate < inception ? inception : candidate;
}

const SUBTITLES: Record<Period, string> = {
  "1W": "over the last week",
  "1M": "over the last month",
  YTD: "year-to-date",
  "1Y": "over the last year",
  "3Y": "over the last 3 years",
  ITD: "since the first transaction",
};

export function periodSubtitle(period: Period): string {
  return SUBTITLES[period];
}
