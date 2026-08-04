import Decimal from "decimal.js";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { tickerFundamentals } from "@/server/db/schema";
import { getAllocationModel } from "@/server/queries/allocation-targets";
import { getCurrentTheses } from "@/server/queries/theses";
import {
  evaluateGuidelines,
  type GuidelineViolation,
  type RollupBucket,
} from "@/server/services/guidelines";
import {
  evaluateLevelTriggers,
  type LevelTrigger,
  type LevelTriggerInput,
} from "@/server/services/level-triggers";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { mergePositionsByTicker } from "@/server/services/computation";
import {
  formatCurrency,
  formatDate,
  formatIRR,
  formatPercent,
} from "@/lib/formatting";

const DASH = "—";

export interface ConstructionRollupRow {
  bucket: RollupBucket;
  label: string;
  policyTarget: { value: number; display: string };
  modelTarget: { value: number; display: string };
  realWeight: { value: number | null; display: string };
  drift: { value: number | null; display: string };
  driftRel: { value: number | null; display: string };
  bandBreach: boolean;
  nameCount: number;
}

export interface ConstructionTriggerRow {
  ticker: string;
  kind: LevelTrigger["kind"];
  levelPrice: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  distancePct: { value: number | null; display: string };
  dueDate: { value: string | null; display: string };
  triggered: boolean;
  suppressedBy: LevelTrigger["kind"] | null;
  note: string | null;
}

export interface ConstructionPageData {
  rollups: ConstructionRollupRow[];
  violations: GuidelineViolation[];
  warnCount: number;
  infoCount: number;
  /** Triggered levels + suppressed signals; quiet levels only counted. */
  triggers: ConstructionTriggerRow[];
  watchedLevelCount: number;
}

const SEVERITY_ORDER = { warn: 0, info: 1 } as const;

export function getConstructionData(): ConstructionPageData {
  const model = getAllocationModel();

  const tickers = model.rows
    .filter((row) => row.kind === "ticker")
    .map((row) => ({
      ticker: row.name.value,
      bucket: row.bucket.value,
      targetWeightPct: row.targetWeight.value ?? 0,
      realWeightPct: row.realWeight.value,
    }));

  const openPremiumAtCostPct =
    model.totalPortfolioValueUsd > 0
      ? (model.openOptionPremiumAtCostUsd / model.totalPortfolioValueUsd) * 100
      : null;

  const { rollups, violations } = evaluateGuidelines({
    tickers,
    cash: {
      modelTargetPct: model.cashAggregate.targetWeight.value,
      realPct: model.cashAggregate.realWeight.value,
    },
    options: { openPremiumAtCostPct },
  });

  const sortedViolations = [...violations].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const { triggers, watchedLevelCount } = getTriggerRows();

  return {
    rollups: rollups.map((r) => ({
      bucket: r.bucket,
      label: r.label,
      policyTarget: {
        value: r.policyTargetPct,
        display: formatPercent(r.policyTargetPct),
      },
      modelTarget: {
        value: r.modelTargetPct,
        display: formatPercent(r.modelTargetPct),
      },
      realWeight: {
        value: r.realPct,
        display: r.realPct === null ? DASH : formatPercent(r.realPct),
      },
      drift: {
        value: r.driftAbsPts,
        display: r.driftAbsPts === null ? DASH : formatIRR(r.driftAbsPts),
      },
      driftRel: {
        value: r.driftRelPct,
        display: r.driftRelPct === null ? DASH : formatIRR(r.driftRelPct),
      },
      bandBreach: r.bandBreach,
      nameCount: r.nameCount,
    })),
    violations: sortedViolations,
    warnCount: violations.filter((v) => v.severity === "warn").length,
    infoCount: violations.filter((v) => v.severity === "info").length,
    triggers,
    watchedLevelCount,
  };
}

/**
 * Builds Engine 4's inputs from current-final theses: last USD price from the
 * live position (held names) or the fundamentals snapshot (watchlist names),
 * then formats triggered/suppressed rows for the dashboard. Quiet levels are
 * only counted — the table stays a demand list, not a level inventory.
 */
function getTriggerRows(): {
  triggers: ConstructionTriggerRow[];
  watchedLevelCount: number;
} {
  const theses = getCurrentTheses();
  if (theses.length === 0) return { triggers: [], watchedLevelCount: 0 };

  const { txInputs, fxRates, today, positions } = fetchPositionInputs();
  const merged = mergePositionsByTicker(positions, txInputs, fxRates, today);

  const heldPriceByTicker = new Map<string, number | null>();
  for (const pos of merged) {
    if (pos.instrument !== "stock" || pos.isClosed) continue;
    heldPriceByTicker.set(
      pos.ticker,
      pos.sharesHeld > 0 && pos.marketValue !== null
        ? new Decimal(pos.marketValue).div(pos.sharesHeld).toNumber()
        : null,
    );
  }

  const nonHeld = theses
    .map((t) => t.ticker)
    .filter((ticker) => !heldPriceByTicker.has(ticker));
  const fundamentalsPrice = new Map<string, number | null>();
  if (nonHeld.length > 0) {
    const rows = db
      .select({
        ticker: tickerFundamentals.ticker,
        price: tickerFundamentals.price,
      })
      .from(tickerFundamentals)
      .where(
        nonHeld.length === 1
          ? eq(tickerFundamentals.ticker, nonHeld[0])
          : inArray(tickerFundamentals.ticker, nonHeld),
      )
      .all();
    for (const r of rows) fundamentalsPrice.set(r.ticker, r.price);
  }

  const inputs: LevelTriggerInput[] = theses.map((t) => {
    const isHeld = heldPriceByTicker.has(t.ticker);
    return {
      ticker: t.ticker,
      bucket: t.bucket,
      isHeld,
      entryZoneLow: t.entryZoneLow,
      entryZoneHigh: t.entryZoneHigh,
      addLevel: t.addLevel,
      addDownState: t.addDownState,
      technicalBackstop: t.technicalBackstop,
      expiresAt: t.expiresAt,
      reviewedAt: t.reviewedAt,
      lastPriceUsd: isHeld
        ? (heldPriceByTicker.get(t.ticker) ?? null)
        : (fundamentalsPrice.get(t.ticker) ?? null),
    };
  });

  const all = evaluateLevelTriggers(inputs, today);
  const demands = all.filter((r) => r.triggered || r.suppressedBy !== null);
  const KIND_ORDER: Record<LevelTrigger["kind"], number> = {
    expiry_review: 0,
    backstop_review: 1,
    add_down: 2,
    entry: 3,
  };
  demands.sort(
    (a, b) =>
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.ticker.localeCompare(b.ticker),
  );

  return {
    triggers: demands.map((r) => ({
      ticker: r.ticker,
      kind: r.kind,
      levelPrice: {
        value: r.levelPrice,
        display: r.levelPrice === null ? DASH : formatCurrency(r.levelPrice),
      },
      lastPrice: {
        value: r.lastPrice,
        display: r.lastPrice === null ? DASH : formatCurrency(r.lastPrice),
      },
      distancePct: {
        value: r.distancePct,
        display: r.distancePct === null ? DASH : formatIRR(r.distancePct),
      },
      dueDate: {
        value: r.dueDate,
        display: r.dueDate === null ? DASH : formatDate(r.dueDate),
      },
      triggered: r.triggered,
      suppressedBy: r.suppressedBy,
      note: r.note,
    })),
    watchedLevelCount: all.length - demands.length,
  };
}
