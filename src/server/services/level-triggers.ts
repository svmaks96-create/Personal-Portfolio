import { addDays, format, parseISO } from "date-fns";
import { ADMISSION_RULES } from "@/shared/policy";

/**
 * Engine 4 — triggers & review demands. Pure: current-final theses + last USD
 * prices + today in, trigger rows out. Everything is computed on read; the
 * only stateful input is add_down_state (consumed adds never re-trigger).
 *
 * Precedence (IPS): a pending backstop or expiry review SUPPRESSES entry and
 * add-down signals for that name — no buying into an un-reviewed thesis. A
 * backstop cross is a review demand, never a sell signal.
 */

export type TriggerKind =
  | "entry"
  | "add_down"
  | "backstop_review"
  | "expiry_review";

export interface LevelTriggerInput {
  ticker: string;
  bucket: "core" | "active";
  /** Held names get add-down/backstop semantics; non-held get cooling info. */
  isHeld: boolean;
  entryZoneLow: number | null;
  entryZoneHigh: number | null;
  addLevel: number | null;
  addDownState: "available" | "used" | "void";
  technicalBackstop: number | null;
  /** ISO timestamps from the thesis row. */
  expiresAt: string | null;
  reviewedAt: string | null;
  lastPriceUsd: number | null;
}

export interface LevelTrigger {
  ticker: string;
  kind: TriggerKind;
  levelPrice: number | null;
  lastPrice: number | null;
  /** (last − level) / level × 100; sign says how far above (+) / below (−). */
  distancePct: number | null;
  /** expiry_review: the expiry date · entry (non-held): the buy-eligible date. */
  dueDate: string | null;
  triggered: boolean;
  /** Set when a triggered review demand suppresses this buy signal. */
  suppressedBy: TriggerKind | null;
  note: string | null;
}

function distancePct(last: number, level: number): number {
  return ((last - level) / level) * 100;
}

/** Lexicographic compare on the date part — ISO strings sort correctly. */
function onOrAfter(todayIsoDate: string, isoTimestamp: string): boolean {
  return todayIsoDate >= isoTimestamp.slice(0, 10);
}

export function evaluateLevelTriggers(
  inputs: LevelTriggerInput[],
  todayIsoDate: string,
): LevelTrigger[] {
  const out: LevelTrigger[] = [];

  for (const t of inputs) {
    // Core rows carry no levels, break conditions, or horizon by policy.
    if (t.bucket !== "active") continue;

    const rows: LevelTrigger[] = [];

    // --- Review demands (evaluated first: they gate the buy signals) ---
    if (t.expiresAt !== null) {
      const expired = onOrAfter(todayIsoDate, t.expiresAt);
      rows.push({
        ticker: t.ticker,
        kind: "expiry_review",
        levelPrice: null,
        lastPrice: t.lastPriceUsd,
        distancePct: null,
        dueDate: t.expiresAt.slice(0, 10),
        triggered: expired,
        suppressedBy: null,
        note: expired ? "Thesis expired — re-underwrite or exit" : null,
      });
    }

    if (t.technicalBackstop !== null && t.lastPriceUsd !== null) {
      const crossed = t.lastPriceUsd <= t.technicalBackstop;
      rows.push({
        ticker: t.ticker,
        kind: "backstop_review",
        levelPrice: t.technicalBackstop,
        lastPrice: t.lastPriceUsd,
        distancePct: distancePct(t.lastPriceUsd, t.technicalBackstop),
        dueDate: null,
        triggered: crossed,
        suppressedBy: null,
        note: crossed ? "Re-underwrite due within 7 days — not a sell signal" : null,
      });
    }

    const reviewPending =
      rows.find((r) => r.triggered)?.kind ?? null;

    // --- Buy signals (suppressed while a review demand is pending) ---
    const entryLevel = t.entryZoneHigh ?? t.entryZoneLow;
    if (entryLevel !== null && t.lastPriceUsd !== null) {
      const last = t.lastPriceUsd;
      const inZone =
        t.entryZoneHigh !== null
          ? last <= t.entryZoneHigh &&
            (t.entryZoneLow === null || last >= t.entryZoneLow)
          : last <= (t.entryZoneLow as number);

      let dueDate: string | null = null;
      let note: string | null = null;
      if (!t.isHeld && t.reviewedAt !== null) {
        const eligible = format(
          addDays(parseISO(t.reviewedAt), ADMISSION_RULES.coolingPeriodDays),
          "yyyy-MM-dd",
        );
        dueDate = eligible;
        note =
          todayIsoDate < eligible
            ? `Cooling period — buy-eligible from ${eligible}`
            : null;
      }

      rows.push({
        ticker: t.ticker,
        kind: "entry",
        levelPrice: entryLevel,
        lastPrice: last,
        distancePct: distancePct(last, entryLevel),
        dueDate,
        triggered: inZone && reviewPending === null,
        suppressedBy: inZone && reviewPending !== null ? reviewPending : null,
        note,
      });
    }

    if (
      t.addLevel !== null &&
      t.addDownState === "available" &&
      t.lastPriceUsd !== null
    ) {
      const below = t.lastPriceUsd <= t.addLevel;
      rows.push({
        ticker: t.ticker,
        kind: "add_down",
        levelPrice: t.addLevel,
        lastPrice: t.lastPriceUsd,
        distancePct: distancePct(t.lastPriceUsd, t.addLevel),
        dueDate: null,
        triggered: below && reviewPending === null,
        suppressedBy: below && reviewPending !== null ? reviewPending : null,
        note: null,
      });
    }

    out.push(...rows);
  }

  return out;
}
