import { db } from "@/server/db";
import { positionTheses } from "@/server/db/schema";
import { and, asc, desc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { parseBreakConditions } from "@/shared/schemas/position-thesis";
import { reconcileActiveTargets } from "@/shared/policy";
import { getAllocationModel } from "@/server/queries/allocation-targets";
import { getCashTargetWeight } from "@/server/queries/app-settings";
import { formatPercent } from "@/lib/formatting";

const DASH = "—";

type ThesisSelect = typeof positionTheses.$inferSelect;

/** A thesis row with the JSON break-conditions column parsed. */
export interface ThesisRecord extends ThesisSelect {
  breakConditionsList: string[];
}

export interface DraftQueueEntry {
  draft: ThesisRecord;
  /** The current final version this draft would supersede; null on first underwriting. */
  prior: ThesisRecord | null;
}

export interface ResearchRosterRow {
  ticker: string;
  bucket: ThesisSelect["bucket"];
  conviction: number | null;
  promiseRank: number | null;
  keepDecision: ThesisSelect["keepDecision"];
  horizonMonths: number | null;
  expiresAt: string | null;
  addDownState: ThesisSelect["addDownState"];
  /** Ladder value on the thesis. */
  targetWeightPct: { value: number | null; display: string };
  /** Ladder value after reconcileActiveTargets across all current finals. */
  reconciledWeightPct: { value: number | null; display: string };
  /** What allocation_targets currently allots this name. */
  allocationWeightPct: { value: number | null; display: string };
  realWeightPct: { value: number | null; display: string };
  /** Before/after numbers for the applyTargetToAllocation confirm dialog. */
  applyPreview: {
    weightBefore: number;
    weightAfter: number;
    cashBefore: number;
    cashAfter: number;
  } | null;
}

export interface ResearchPageData {
  drafts: DraftQueueEntry[];
  roster: ResearchRosterRow[];
}

function toRecord(row: ThesisSelect): ThesisRecord {
  return { ...row, breakConditionsList: parseBreakConditions(row.breakConditions) };
}

export function getCurrentTheses(): ThesisRecord[] {
  return db
    .select()
    .from(positionTheses)
    .where(
      and(eq(positionTheses.status, "final"), eq(positionTheses.isCurrent, true)),
    )
    .orderBy(asc(positionTheses.ticker))
    .all()
    .map(toRecord);
}

export function getDraftQueue(): DraftQueueEntry[] {
  const drafts = db
    .select()
    .from(positionTheses)
    .where(eq(positionTheses.status, "draft"))
    .orderBy(asc(positionTheses.ticker))
    .all()
    .map(toRecord);

  const currents = new Map(getCurrentTheses().map((t) => [t.ticker, t]));
  return drafts.map((draft) => ({
    draft,
    prior: currents.get(draft.ticker) ?? null,
  }));
}

export function getThesisHistory(ticker: string): ThesisRecord[] {
  return db
    .select()
    .from(positionTheses)
    .where(eq(positionTheses.ticker, ticker.toUpperCase()))
    .orderBy(desc(positionTheses.version))
    .all()
    .map(toRecord);
}

export interface TickerThesisData {
  current: ThesisRecord | null;
  draft: ThesisRecord | null;
  history: ThesisRecord[];
}

export function getThesisForTicker(ticker: string): TickerThesisData {
  const history = getThesisHistory(ticker);
  return {
    current:
      history.find((t) => t.status === "final" && t.isCurrent) ?? null,
    draft: history.find((t) => t.status === "draft") ?? null,
    history,
  };
}

/**
 * Reconciled ladder weight per active current-final ticker — the bucket target
 * binds over the ladder (IPS Part IV precedence rule).
 */
export function getReconciledActiveWeights(
  theses: ThesisRecord[],
): Map<string, number> {
  const active = theses.filter(
    (t) => t.bucket === "active" && t.targetWeightPct !== null,
  );
  const reconciled = reconcileActiveTargets(
    active.map((t) => t.targetWeightPct as number),
  );
  return new Map(active.map((t, i) => [t.ticker, reconciled[i]]));
}

export function getResearchPageData(): ResearchPageData {
  const drafts = getDraftQueue();
  const currents = getCurrentTheses();
  const reconciledByTicker = getReconciledActiveWeights(currents);

  const model = getAllocationModel();
  const allocationByTicker = new Map(
    model.rows
      .filter((r) => r.kind === "ticker")
      .map((r) => [
        r.name.value,
        {
          target: r.targetWeight.value,
          real: r.realWeight.value,
        },
      ]),
  );
  const cashBefore = getCashTargetWeight();

  const roster: ResearchRosterRow[] = currents.map((t) => {
    const reconciled = reconciledByTicker.get(t.ticker) ?? null;
    const allocation = allocationByTicker.get(t.ticker);
    const allocationWeight = allocation?.target ?? null;

    let applyPreview: ResearchRosterRow["applyPreview"] = null;
    if (t.bucket === "active" && reconciled !== null) {
      const weightBefore = allocationWeight ?? 0;
      const cashAfter = new Decimal(cashBefore)
        .minus(new Decimal(reconciled).minus(weightBefore))
        .toDecimalPlaces(2)
        .toNumber();
      applyPreview = {
        weightBefore,
        weightAfter: reconciled,
        cashBefore,
        cashAfter,
      };
    }

    return {
      ticker: t.ticker,
      bucket: t.bucket,
      conviction: t.conviction,
      promiseRank: t.promiseRank,
      keepDecision: t.keepDecision,
      horizonMonths: t.horizonMonths,
      expiresAt: t.expiresAt,
      addDownState: t.addDownState,
      targetWeightPct: {
        value: t.targetWeightPct,
        display: t.targetWeightPct === null ? DASH : formatPercent(t.targetWeightPct),
      },
      reconciledWeightPct: {
        value: reconciled,
        display: reconciled === null ? DASH : formatPercent(reconciled),
      },
      allocationWeightPct: {
        value: allocationWeight,
        display: allocationWeight === null ? DASH : formatPercent(allocationWeight),
      },
      realWeightPct: {
        value: allocation?.real ?? null,
        display:
          allocation?.real === null || allocation === undefined
            ? DASH
            : formatPercent(allocation.real),
      },
      applyPreview,
    };
  });

  return { drafts, roster };
}
