/**
 * Machine-readable investment policy — the construction rulebook
 * (v3.3, 2026-08-11, effective 2026-08-18 after the cooling period).
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

/**
 * Engine internal split (% of total portfolio); must sum to the core target.
 * VTI:VXUS at the global market-cap ratio (≈60:40) — opinion-free. VPU is a
 * capped structural satellite (v3.3): its 10-pt target is sector-bet
 * discipline, not a risk optimum (min-variance would hold >30%); it must stay
 * below the 14-pt cap an underwritten active sector earns. Never grown past
 * its band, never the funding source for the active-sleeve transition.
 */
export const ENGINE_SPLIT = { VTI: 28, VXUS: 19, VPU: 10 } as const;

/** VPU satellite band and annual retention tests (IPS Part III). */
export const VPU_SATELLITE = {
  bandPts: { min: 8, max: 12 },
  /** Fold into VTI/VXUS if sleeve correlation sustains above this. */
  maxCorrelationToActiveSleeve: 0.4,
} as const;

/**
 * Expected worst-case drawdowns (Part II), written down so the stressed
 * decision is made in advance. Sleeve numbers from the /risk 2022 replay
 * (−52% on 76% coverage — an understated floor).
 */
export const EXPECTED_WORST_CASE = {
  bookPct: -35,
  sleeveFloorPct: -60,
  sleeveTypicalPct: -50,
} as const;

/** Annual option premium budget AT COST, % of current book (Part V of the IPS). */
export const OPTIONS_BUDGET_PCT = 3;

/**
 * Options sleeve spec — long calls / call debit spreads only, ≥12-month tenor,
 * ≤1% of book premium per position. Annual budget check at each open:
 * open premium at cost + max(0, −net YTD realized options P&L) ≤ 3% of current
 * book. Closes refund their cost basis; realized P&L is netted across all
 * option trades, so a net loss shrinks the budget and a net profit never grows
 * it past 3%. Underlyings: underwritten active names (+ SPY/VTI while a crash
 * protocol is active).
 */
export const OPTIONS_SPEC = {
  instruments: ["long_call", "call_debit_spread"],
  minTenorMonths: 12,
  maxPremiumPerPositionPct: 1,
  annualPremiumBudgetPct: OPTIONS_BUDGET_PCT,
  costBasisRefundedOnClose: true,
  netRealizedLossShrinksBudget: true,
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
 * Max points of book in one sector (target weights) — 40% of the active
 * bucket. "One sector" is defined by the /risk correlation clusters as the
 * default evidence (v3.3), overriding GICS where they disagree; judgment may
 * split a cluster with written rationale, never merge past the data.
 */
export const SECTOR_CAP_PTS_OF_BOOK = 14;

/** Cluster threshold defining "one sector" for the cap (avg pairwise shrunk ρ). */
export const SECTOR_CAP_CLUSTER_MIN_CORRELATION = 0.5;

/**
 * High-volatility entry rung-down (v3.3, Part IV): names above the standalone
 * vol threshold enter one conviction rung below the ladder, graduating after
 * both conditions are met at a scheduled review.
 */
export const HIGH_VOL_ENTRY = {
  /** Standalone vol > this multiple of SPY's → rung-down applies. */
  standaloneVolVsSpyRatio: 2,
  rungsBelowConviction: 1,
  graduationMinListedMonths: 12,
  /** Risk share must be ≤ this multiple of capital weight to graduate. */
  graduationMaxRiskShareVsWeight: 2,
} as const;

/**
 * Sleeve risk guardrail (v3.3, Part IV): recorded quarterly from /risk. While
 * breached, admissions and active-sleeve contributions must have a marginal
 * risk (+$10k → Δvol) below the sleeve median. Gates inflows only — no
 * existing position is ever trimmed on this rule.
 */
export const SLEEVE_RISK_GUARDRAIL = {
  maxBetaVsSpy: 1.4,
  maxVolVsSpyRatio: 1.75,
} as const;

/**
 * Sleeve-specific unwind review (v3.3, Part VII): the crash protocol is keyed
 * to SPY and cannot see a sector-specific crash. Sleeve ≤ −35% from its own
 * high while SPY is above the crash-activation level → full break-condition
 * review within 7 days. Review only; nothing is sold on price.
 */
export const SLEEVE_UNWIND_REVIEW = {
  sleeveDrawdownPct: -35,
  reviewWithinDays: 7,
} as const;

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
  /**
   * v3.3 rung-down: the name's standalone vol exceeds the HIGH_VOL_ENTRY
   * threshold and it has not yet graduated — size one conviction rung below.
   */
  highVolEntry?: boolean;
}

/**
 * Sizing-ladder lookup: bucket + conviction → target weight (% of total portfolio).
 *
 * Returns null when the ladder has no rung: the passive core (band-rebalanced,
 * no per-name ladder), conviction below 3 (no slot — cut or never enter), and
 * a high-vol conviction-3 name (the rung below 3 does not exist).
 */
export function deriveTargetWeight(
  bucket: PolicyBucket,
  conviction: number,
  opts: DeriveTargetWeightOptions = {},
): number | null {
  if (opts.keepDecision === "cut") return 0;
  if (bucket === "core") return null;

  const effective = opts.highVolEntry
    ? conviction - HIGH_VOL_ENTRY.rungsBelowConviction
    : conviction;

  if (conviction < 3 || conviction > 5) return null;
  if (effective === 5) return SIZING_LADDER.active[5];
  if (effective === 4) return SIZING_LADDER.active[4];
  if (effective === 3) return SIZING_LADDER.active[3];
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
