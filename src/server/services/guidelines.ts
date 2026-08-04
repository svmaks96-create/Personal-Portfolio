import Decimal from "decimal.js";
import {
  BUCKET_LABELS,
  BUCKET_TARGETS,
  CASH_TARGET_WEIGHT,
  NAME_COUNTS,
  NAME_WEIGHT_LIMITS,
  OPTIONS_BUDGET_PCT,
  POLICY_BUCKETS,
  REBALANCE_BANDS,
  type PolicyBucket,
} from "@/shared/policy";

export interface GuidelinesTickerInput {
  ticker: string;
  bucket: PolicyBucket | null;
  /** Target weight from allocation_targets (% of total portfolio). */
  targetWeightPct: number;
  /** Live weight; null when the position can't be priced. */
  realWeightPct: number | null;
}

export interface GuidelinesInput {
  tickers: GuidelinesTickerInput[];
  cash: {
    /** app_settings.cash_target_weight */
    modelTargetPct: number;
    realPct: number | null;
  };
  options: {
    /** Open option premium at cost, % of book; null when not computable. */
    openPremiumAtCostPct: number | null;
  };
}

export type RollupBucket = PolicyBucket | "options" | "cash";

export interface BucketRollup {
  bucket: RollupBucket;
  label: string;
  /** The IPS target (options: the budget ceiling). */
  policyTargetPct: number;
  /** What the allocation model currently allots (options: the budget). */
  modelTargetPct: number;
  realPct: number | null;
  /** realPct − policyTargetPct */
  driftAbsPts: number | null;
  /** driftAbsPts / policyTargetPct × 100 */
  driftRelPct: number | null;
  bandBreach: boolean;
  nameCount: number;
}

export type ViolationCode =
  | "bucket_drift"
  | "cash_band"
  | "options_over_budget"
  | "name_over_cap"
  | "name_below_min"
  | "unbucketed"
  | "count_breach"
  | "model_policy_gap";

export interface GuidelineViolation {
  code: ViolationCode;
  severity: "warn" | "info";
  ticker?: string;
  bucket?: RollupBucket;
  message: string;
  /** The magnitude behind the violation (drift pts, weight pct, count gap…). */
  delta: number | null;
}

export interface GuidelinesResult {
  rollups: BucketRollup[];
  violations: GuidelineViolation[];
}

/** Model-vs-policy target gaps below this many points are rounding, not drift. */
const MODEL_GAP_TOLERANCE_PTS = 0.5;

function exceedsBucketBand(driftAbsPts: Decimal): boolean {
  return driftAbsPts.abs().greaterThan(REBALANCE_BANDS.bucketAbsPts);
}

export function evaluateGuidelines(input: GuidelinesInput): GuidelinesResult {
  const violations: GuidelineViolation[] = [];
  const rollups: BucketRollup[] = [];

  for (const bucket of POLICY_BUCKETS) {
    const rows = input.tickers.filter((t) => t.bucket === bucket);
    const policyTargetPct = BUCKET_TARGETS[bucket];
    const modelTargetPct = rows
      .reduce((sum, r) => sum.plus(r.targetWeightPct), new Decimal(0))
      .toNumber();

    const priced = rows.filter((r) => r.realWeightPct !== null);
    const realPct =
      priced.length > 0
        ? priced
            .reduce((sum, r) => sum.plus(r.realWeightPct as number), new Decimal(0))
            .toNumber()
        : null;

    let driftAbsPts: number | null = null;
    let driftRelPct: number | null = null;
    let bandBreach = false;
    if (realPct !== null) {
      const drift = new Decimal(realPct).minus(policyTargetPct);
      driftAbsPts = drift.toNumber();
      driftRelPct = drift.div(policyTargetPct).times(100).toNumber();
      bandBreach = exceedsBucketBand(drift);
      if (bandBreach) {
        violations.push({
          code: "bucket_drift",
          severity: "warn",
          bucket,
          message: `${BUCKET_LABELS[bucket]} is ${formatPts(driftAbsPts)} pts off its ${policyTargetPct}% target`,
          delta: driftAbsPts,
        });
      }
    }

    rollups.push({
      bucket,
      label: BUCKET_LABELS[bucket],
      policyTargetPct,
      modelTargetPct,
      realPct,
      driftAbsPts,
      driftRelPct,
      bandBreach,
      nameCount: rows.length,
    });

    const modelGap = new Decimal(modelTargetPct).minus(policyTargetPct);
    if (modelGap.abs().greaterThan(MODEL_GAP_TOLERANCE_PTS)) {
      violations.push({
        code: "model_policy_gap",
        severity: "warn",
        bucket,
        message: `${BUCKET_LABELS[bucket]} model targets sum to ${modelTargetPct}% vs the ${policyTargetPct}% policy target`,
        delta: modelGap.toNumber(),
      });
    }
  }

  // Options — budget ceiling, not a drift target. Only over-budget violates.
  {
    const realPct = input.options.openPremiumAtCostPct;
    let driftAbsPts: number | null = null;
    let driftRelPct: number | null = null;
    let bandBreach = false;
    if (realPct !== null) {
      const drift = new Decimal(realPct).minus(OPTIONS_BUDGET_PCT);
      driftAbsPts = drift.toNumber();
      driftRelPct = drift.div(OPTIONS_BUDGET_PCT).times(100).toNumber();
      if (drift.greaterThan(0)) {
        bandBreach = true;
        violations.push({
          code: "options_over_budget",
          severity: "warn",
          bucket: "options",
          message: `Open option premium at cost is ${realPct.toFixed(2)}% of book — over the ${OPTIONS_BUDGET_PCT}% budget`,
          delta: driftAbsPts,
        });
      }
    }
    rollups.push({
      bucket: "options",
      label: "Options",
      policyTargetPct: OPTIONS_BUDGET_PCT,
      modelTargetPct: OPTIONS_BUDGET_PCT,
      realPct,
      driftAbsPts,
      driftRelPct,
      bandBreach,
      nameCount: 0,
    });
  }

  // Cash — model target lives in app_settings, policy target in the IPS.
  {
    const policyTargetPct = CASH_TARGET_WEIGHT;
    const { modelTargetPct, realPct } = input.cash;
    let driftAbsPts: number | null = null;
    let driftRelPct: number | null = null;
    let bandBreach = false;
    if (realPct !== null) {
      const drift = new Decimal(realPct).minus(policyTargetPct);
      driftAbsPts = drift.toNumber();
      driftRelPct = drift.div(policyTargetPct).times(100).toNumber();
      bandBreach = exceedsBucketBand(drift);
      if (bandBreach) {
        violations.push({
          code: "cash_band",
          severity: "warn",
          bucket: "cash",
          message: `Cash is ${formatPts(driftAbsPts)} pts off its ${policyTargetPct}% target`,
          delta: driftAbsPts,
        });
      }
    }
    rollups.push({
      bucket: "cash",
      label: "Cash",
      policyTargetPct,
      modelTargetPct,
      realPct,
      driftAbsPts,
      driftRelPct,
      bandBreach,
      nameCount: 0,
    });

    const modelGap = new Decimal(modelTargetPct).minus(policyTargetPct);
    if (modelGap.abs().greaterThan(MODEL_GAP_TOLERANCE_PTS)) {
      violations.push({
        code: "model_policy_gap",
        severity: "warn",
        bucket: "cash",
        message: `Cash model target is ${modelTargetPct}% vs the ${policyTargetPct}% policy target`,
        delta: modelGap.toNumber(),
      });
    }
  }

  // Per-name rules — active sleeve only. Core ETFs have no per-name rules.
  for (const row of input.tickers) {
    if (row.bucket === null) {
      violations.push({
        code: "unbucketed",
        severity: "info",
        ticker: row.ticker,
        message: "No bucket assigned — set it on /allocation",
        delta: null,
      });
      continue;
    }
    if (row.bucket !== "active" || row.realWeightPct === null) continue;

    if (row.realWeightPct > NAME_WEIGHT_LIMITS.hardCapPct) {
      violations.push({
        code: "name_over_cap",
        severity: "warn",
        ticker: row.ticker,
        bucket: row.bucket,
        message: `At ${row.realWeightPct.toFixed(2)}% of book — over the ${NAME_WEIGHT_LIMITS.hardCapPct}% hard cap, trim to target is mandatory`,
        delta: row.realWeightPct,
      });
    } else if (row.realWeightPct > 0 && row.realWeightPct < NAME_WEIGHT_LIMITS.minPct) {
      violations.push({
        code: "name_below_min",
        severity: "info",
        ticker: row.ticker,
        bucket: row.bucket,
        message: `At ${row.realWeightPct.toFixed(2)}% of book — below the ${NAME_WEIGHT_LIMITS.minPct}% minimum: top up to target or exit`,
        delta: row.realWeightPct,
      });
    }
  }

  // Name-count caps — active sleeve only (bucketed rows; unbucketed flagged above).
  {
    const count = input.tickers.filter((t) => t.bucket === "active").length;
    const { min, max } = NAME_COUNTS.active;
    if (count > max) {
      violations.push({
        code: "count_breach",
        severity: "warn",
        bucket: "active",
        message: `${BUCKET_LABELS.active} holds ${count} names — above the ${min}–${max} cap, prune`,
        delta: count - max,
      });
    } else if (count > 0 && count < min) {
      violations.push({
        code: "count_breach",
        severity: "info",
        bucket: "active",
        message: `${BUCKET_LABELS.active} holds ${count} names — below the ${min}–${max} range`,
        delta: count - min,
      });
    }
  }

  return { rollups, violations };
}

function formatPts(pts: number): string {
  const rounded = Math.round(pts * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}
