/**
 * Machine-readable investment policy — the construction rulebook (v3, 2026-08-04).
 *
 * Prose source of truth: docs/investment-policy.md — policy.test.ts pins every
 * number here against that document; change them together.
 * Client-safe: pure data and functions only (no decimal.js, no server imports).
 * Weights are percent of TOTAL portfolio (invested holdings + investable cash).
 */

export const POLICY_BUCKETS = ["core", "active"] as const;
export type PolicyBucket = (typeof POLICY_BUCKETS)[number];

export type KeepDecision = "keep" | "cut";

export const BUCKET_LABELS: Record<PolicyBucket, string> = {
  core: "Passive Core",
  active: "Active Stocks",
};

/**
 * v3 split: Engine 57 / Active 35 / Options 3 / Cash 5.
 * The core target is a FLOOR that only ratchets up via the kill switch —
 * it never moves back toward the active sleeve.
 */
export const BUCKET_TARGETS: Record<PolicyBucket, number> = {
  core: 57,
  active: 35,
};

export const CASH_TARGET_WEIGHT = 5;

/** Annual option premium budget AT COST, % of book (Part V of the IPS). */
export const OPTIONS_BUDGET_PCT = 3;

/**
 * Options sleeve spec — long calls / call debit spreads only, ≥12-month tenor,
 * ≤1% of book premium per position, calendar-year budget with no recycling of
 * realized gains. Underlyings: underwritten active names (+ SPY/VTI while a
 * crash protocol is active).
 */
export const OPTIONS_SPEC = {
  instruments: ["long_call", "call_debit_spread"],
  minTenorMonths: 12,
  maxPremiumPerPositionPct: 1,
  annualPremiumBudgetPct: OPTIONS_BUDGET_PCT,
  realizedGainsRecycle: false,
} as const;

export const SIZING_LADDER = {
  active: { 5: 5.5, 4: 4.5, 3: 3.5 },
} as const;

export const NAME_WEIGHT_LIMITS = {
  /** Below this real weight a held active name demands: top up to target or exit. */
  minPct: 3,
  /** Mandatory trim back to ladder target above this — one of only two trim triggers. */
  hardCapPct: 8,
} as const;

export const NAME_COUNTS = {
  active: { min: 6, max: 8 },
} as const;

/**
 * Max points of book in one GICS sector (target weights; correlated theses
 * count as one sector) — 40% of the active bucket.
 */
export const SECTOR_CAP_PTS_OF_BOOK = 14;

/** Admission rules for new active names (Part IV of the IPS). */
export const ADMISSION_RULES = {
  /** Days between completed underwriting and first buy. */
  coolingPeriodDays: 7,
  maxNewNamesPerQuarter: 2,
  /** A full sleeve admits only by displacing the lowest-conviction incumbent. */
  displacementRequiredAtMaxCount: true,
} as const;

/**
 * Active theses are underwritten on a 1–3 year horizon (the 10+ year horizon is
 * the portfolio's). At the stated horizon a thesis EXPIRES: re-underwrite from
 * scratch or exit — "it'll work eventually" belongs to the Engine.
 */
export const THESIS_HORIZON_YEARS = { min: 1, max: 3 } as const;

/** Add / average-down rules (Part IV of the IPS). */
export const ADD_RULES = {
  /** Pre-committed add-downs per position, ever. */
  maxAddDownsPerPosition: 1,
  /**
   * During an active crash protocol an add-down stays valid only if the name's
   * drawdown ≤ this multiple of SPY's (falling through the market = presumed
   * name-specific bad news, which voids the add-down).
   */
  crashCarveOutMaxDrawdownVsSpy: 1.25,
} as const;

export const REBALANCE_BANDS = {
  /** Rebalance a bucket when off target by more than this many absolute points. */
  bucketAbsPts: 5,
} as const;

/**
 * Crash-protocol definitions: triggers measured on SPY close vs its all-time
 * closing high; protocol is active from the first −20% close until SPY closes
 * back within `recoveredWithinPctOfHigh` of that high.
 */
export const CRASH_DEFINITIONS = {
  measuredOn: "SPY close vs all-time closing high",
  activationDrawdownPct: -20,
  recoveredWithinPctOfHigh: 10,
} as const;

/** Pre-written crash actions, keyed by SPY drawdown from high (see IPS Part VII). */
export const CRASH_PROTOCOL = [
  {
    spyDrawdownPct: -20,
    action:
      "Deploy cash buffer into the Engine; 100% of contributions to the Engine until recovered; break-condition check on all active names",
  },
  {
    spyDrawdownPct: -30,
    action:
      "Raise savings rate if income allows (never from the emergency buffer); options sleeve may deploy remaining annual budget into ≥12-month calls",
  },
  {
    spyDrawdownPct: -40,
    action:
      "Selling equity is prohibited by policy; reread the IPS and the 2021-22 record",
  },
] as const;

/**
 * Kill-switch test for the active sleeve (IPS Part VIII): rolling 24-month TWRR
 * vs VT at each annual review. Fail → shift 10 pts active→core, permanently.
 * Two consecutive fails → active capped at 20% until two consecutive passes.
 */
export const ACTIVE_KILL_SWITCH = {
  benchmark: "VT",
  rollingWindowMonths: 24,
  failShiftPts: 10,
  secondFailActiveCapPct: 20,
} as const;

export interface DeriveTargetWeightOptions {
  keepDecision?: KeepDecision;
}

/**
 * Sizing-ladder lookup: bucket + conviction → target weight (% of total portfolio).
 *
 * Returns null when the ladder has no rung: the passive core (band-rebalanced,
 * no per-name ladder) and conviction below 3 (no slot — cut or never enter).
 */
export function deriveTargetWeight(
  bucket: PolicyBucket,
  conviction: number,
  opts: DeriveTargetWeightOptions = {},
): number | null {
  if (opts.keepDecision === "cut") return 0;
  if (bucket === "core") return null;

  if (conviction === 5) return SIZING_LADDER.active[5];
  if (conviction === 4) return SIZING_LADDER.active[4];
  if (conviction === 3) return SIZING_LADDER.active[3];
  return null;
}

/**
 * Precedence rule (IPS Part IV): the 35% bucket target binds over the ladder.
 * Ladder sums above the bucket scale every name down pro-rata (2dp); sums below
 * leave weights untouched — the remainder belongs to the Engine, never to
 * force-filled picks.
 */
export function reconcileActiveTargets(ladderWeights: number[]): number[] {
  const sum = ladderWeights.reduce((acc, w) => acc + w, 0);
  if (sum <= BUCKET_TARGETS.active) return [...ladderWeights];
  const scale = BUCKET_TARGETS.active / sum;
  return ladderWeights.map((w) => Math.round(w * scale * 100) / 100);
}
