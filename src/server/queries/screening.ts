import { asc, desc, eq, inArray } from "drizzle-orm";
import { addDays, format, parseISO } from "date-fns";
import { db } from "@/server/db";
import {
  positionTheses,
  screeningResults,
  screeningRuns,
  watchlist,
} from "@/server/db/schema";
import {
  screeningCriteriaSchema,
  type ScreeningCriteria,
  type WatchlistStatus,
} from "@/shared/schemas/screening";
import { ADMISSION_RULES } from "@/shared/policy";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { mergePositionsByTicker } from "@/server/services/computation";
import {
  formatCurrency,
  formatDate,
  formatIRR,
  formatMarketCap,
  formatMultiple,
} from "@/lib/formatting";

const DASH = "—";

export interface ScreeningRunInfo {
  id: number;
  runDate: string;
  criteria: ScreeningCriteria | null;
  universeCount: number;
  scoredCount: number;
  fetchedAt: string;
  /** DERIVED: the safety cap bound before the floors — smallest names cut. */
  capTruncated: boolean;
}

export interface ScreeningResultRow {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  marketCap: { value: number | null; display: string };
  price: { value: number | null; display: string };
  fwdPe: { value: number | null; display: string };
  epsGrowthFwd: { value: number | null; display: string };
  priceChange3m: { value: number | null; display: string };
  priceChange6m: { value: number | null; display: string };
  valueScore: { value: number | null; display: string };
  growthScore: { value: number | null; display: string };
  qualityScore: { value: number | null; display: string };
  momentumScore: { value: number | null; display: string };
  compositeScore: { value: number | null; display: string };
  watchlistStatus: WatchlistStatus | null;
}

export interface WatchlistRow {
  ticker: string;
  status: WatchlistStatus;
  note: string | null;
  isHeld: boolean;
  thesisStatus: "none" | "draft" | "final";
  flaggedAt: { value: string; display: string };
  /** Cooling-period eligibility — DERIVED from the thesis reviewed_at. */
  buyEligible: { value: string | null; display: string };
  coolingActive: boolean;
}

export interface ScreeningPageData {
  run: ScreeningRunInfo | null;
  results: ScreeningResultRow[];
  watchlistRows: WatchlistRow[];
}

function pct(value: number | null): { value: number | null; display: string } {
  return { value, display: value === null ? DASH : formatIRR(value) };
}

function score(value: number | null): { value: number | null; display: string } {
  return { value, display: value === null ? DASH : String(Math.round(value)) };
}

export function getScreeningPageData(): ScreeningPageData {
  const runRow = db
    .select()
    .from(screeningRuns)
    .orderBy(desc(screeningRuns.id))
    .limit(1)
    .get();

  const watchRows = db
    .select()
    .from(watchlist)
    .orderBy(asc(watchlist.ticker))
    .all();
  const watchStatusByTicker = new Map<string, WatchlistStatus>(
    watchRows.map((w) => [w.ticker, w.status]),
  );

  let run: ScreeningRunInfo | null = null;
  let results: ScreeningResultRow[] = [];
  if (runRow) {
    const parsedCriteria = screeningCriteriaSchema.safeParse(
      safeJson(runRow.criteriaJson),
    );
    run = {
      id: runRow.id,
      runDate: runRow.runDate,
      criteria: parsedCriteria.success ? parsedCriteria.data : null,
      universeCount: runRow.universeCount,
      scoredCount: runRow.scoredCount,
      fetchedAt: runRow.fetchedAt,
      capTruncated:
        parsedCriteria.success &&
        runRow.universeCount >= parsedCriteria.data.limit,
    };

    // SQLite sorts NULLs last on DESC — all-null-score rows sink to the bottom.
    results = db
      .select()
      .from(screeningResults)
      .where(eq(screeningResults.runId, runRow.id))
      .orderBy(desc(screeningResults.compositeScore))
      .all()
      .map((r) => ({
        ticker: r.ticker,
        companyName: r.companyName,
        sector: r.sector,
        industry: r.industry,
        exchange: r.exchange,
        marketCap: {
          value: r.marketCap,
          display: formatMarketCap(r.marketCap),
        },
        price: {
          value: r.price,
          display: r.price === null ? DASH : formatCurrency(r.price),
        },
        fwdPe: { value: r.fwdPe, display: formatMultiple(r.fwdPe) },
        epsGrowthFwd: pct(
          r.epsGrowthFwd === null ? null : r.epsGrowthFwd * 100,
        ),
        priceChange3m: pct(r.priceChange3m),
        priceChange6m: pct(r.priceChange6m),
        valueScore: score(r.valueScore),
        growthScore: score(r.growthScore),
        qualityScore: score(r.qualityScore),
        momentumScore: score(r.momentumScore),
        compositeScore: score(r.compositeScore),
        watchlistStatus: watchStatusByTicker.get(r.ticker) ?? null,
      }));
  }

  return {
    run,
    results,
    watchlistRows: buildWatchlistRows(watchRows),
  };
}

function buildWatchlistRows(
  watchRows: (typeof watchlist.$inferSelect)[],
): WatchlistRow[] {
  if (watchRows.length === 0) return [];

  const { txInputs, fxRates, today, positions } = fetchPositionInputs();
  const merged = mergePositionsByTicker(positions, txInputs, fxRates, today);
  const heldTickers = new Set(
    merged
      .filter((p) => p.instrument === "stock" && !p.isClosed)
      .map((p) => p.ticker),
  );

  // One query for all watchlist tickers' theses — not one per row.
  const allTheses = db
    .select({
      ticker: positionTheses.ticker,
      status: positionTheses.status,
      isCurrent: positionTheses.isCurrent,
      reviewedAt: positionTheses.reviewedAt,
    })
    .from(positionTheses)
    .where(
      inArray(
        positionTheses.ticker,
        watchRows.map((w) => w.ticker),
      ),
    )
    .all();
  const thesesByTicker = new Map<string, typeof allTheses>();
  for (const t of allTheses) {
    const list = thesesByTicker.get(t.ticker);
    if (list) list.push(t);
    else thesesByTicker.set(t.ticker, [t]);
  }

  return watchRows.map((w) => {
    const theses = thesesByTicker.get(w.ticker) ?? [];
    const currentFinal = theses.find((t) => t.status === "final" && t.isCurrent);
    const hasDraft = theses.some((t) => t.status === "draft");
    const isHeld = heldTickers.has(w.ticker);

    let buyEligibleDate: string | null = null;
    let coolingActive = false;
    if (!isHeld && currentFinal?.reviewedAt) {
      buyEligibleDate = format(
        addDays(
          parseISO(currentFinal.reviewedAt),
          ADMISSION_RULES.coolingPeriodDays,
        ),
        "yyyy-MM-dd",
      );
      coolingActive = today < buyEligibleDate;
    }

    return {
      ticker: w.ticker,
      status: w.status,
      note: w.note,
      isHeld,
      thesisStatus: hasDraft
        ? ("draft" as const)
        : currentFinal
          ? ("final" as const)
          : ("none" as const),
      flaggedAt: { value: w.createdAt, display: formatDate(w.createdAt) },
      buyEligible: {
        value: buyEligibleDate,
        display: buyEligibleDate === null ? DASH : formatDate(buyEligibleDate),
      },
      coolingActive,
    };
  });
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
