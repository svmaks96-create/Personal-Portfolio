"use server";

import { revalidatePath } from "next/cache";
import { format, subDays } from "date-fns";
import { db } from "@/server/db";
import {
  screeningResults,
  screeningRuns,
  watchlist,
} from "@/server/db/schema";
import { and, asc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import {
  fetchForwardEps,
  fetchKeyMetricsTtm,
  fetchPriceChange,
  fetchRatiosTtm,
  fetchScreenerCompanies,
  fetchStockPrices,
} from "@/server/services/fmp";
import { upsertMarketDataRows } from "@/server/db/market-data-writer";
import {
  computeEpsRevision,
  computeQuantScores,
  momentum12m1m,
  type QuantMetricsInput,
} from "@/server/services/quant-score";
import {
  screeningCriteriaSchema,
  WATCHLIST_STATUSES,
  WATCHLIST_TRANSITIONS,
  type ScreeningCriteriaInput,
  type WatchlistStatus,
} from "@/shared/schemas/screening";
import type { ActionResult } from "@/server/types/action-result";

// Connection bound only — calls/minute are governed by the global sliding-
// window limiter inside fmp.ts (fmpFetch), which all FMP callers share.
const SCREENING_CONCURRENCY = 16;
/** 370 days ≈ 1y of trading history plus buffer for the 200-DMA window. */
const BACKFILL_LOOKBACK_DAYS = 370;

/**
 * Abort the run (write nothing) when more than this share of the universe is
 * DEGRADED — i.e. still has a failed fetch after one retry. Loose enough for
 * routine gaps, tight enough to catch an FMP outage or rate-limit event.
 */
const MAX_DEGRADED_RATE = 0.15;

/**
 * Estimate-revision comparison window: the prior FY1-EPS snapshot must be old
 * enough to carry signal but recent enough to target the same fiscal year.
 */
const REVISION_MIN_AGE_DAYS = 21;
const REVISION_MAX_AGE_DAYS = 120;

/** Runs older than this are pruned with each new run (2 years — plenty for
 * revisions at 120 days and year-over-year comparisons). */
const RUN_RETENTION_DAYS = 730;

/** Bounded-concurrency async map (mirrors market-data.ts's private helper). */
async function mapInChunks<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const settled = await Promise.allSettled(chunk.map((item) => fn(item)));
    results.push(...settled);
  }
  return results;
}

export interface RunScreenResult {
  runId: number;
  scored: number;
  failed: number;
  /** True when the safety cap bound before the floors — universe was cut. */
  truncated: boolean;
}

/**
 * Engine 2's long server action: screener universe → per-ticker metric fan-out
 * → quant percentile scoring → one dated snapshot (run + results) in one
 * transaction. Never auto-runs on page load — the Run button is the only
 * caller. Returns {scored, failed}; failed names are still stored (all-null
 * metrics) so the universe count stays honest.
 */
export async function runScreen(
  criteriaInput: ScreeningCriteriaInput,
): Promise<ActionResult<RunScreenResult>> {
  try {
    const parsed = screeningCriteriaSchema.safeParse(criteriaInput ?? {});
    if (!parsed.success) {
      const message =
        parsed.error.issues[0]?.message ?? "Invalid screening criteria";
      return { success: false, error: message };
    }
    const criteria = parsed.data;

    // Dedupe defensively — a duplicate symbol from FMP would violate the
    // (runId, ticker) unique index and roll back the entire run at the end.
    const rawCompanies = await fetchScreenerCompanies(criteria);
    const seenSymbols = new Set<string>();
    const companies = rawCompanies.filter((c) => {
      if (seenSymbols.has(c.symbol)) return false;
      seenSymbols.add(c.symbol);
      return true;
    });
    if (companies.length === 0) {
      return {
        success: false,
        error:
          "Screener returned no companies — check the FMP key, floors, or rate limit",
      };
    }

    const now = new Date();
    const todayIso = format(now, "yyyy-MM-dd");

    const universeTickers = companies.map((c) => c.symbol);

    // Prior FY1-EPS snapshots for the estimate-revision signal: the latest
    // run 21–120 days old, per ticker. Two flat queries — no join needed.
    const priorEpsByTicker = new Map<string, { epsAvg: number; date: string }>();
    {
      const windowRuns = db
        .select({ id: screeningRuns.id })
        .from(screeningRuns)
        .where(
          and(
            gte(
              screeningRuns.runDate,
              format(subDays(now, REVISION_MAX_AGE_DAYS), "yyyy-MM-dd"),
            ),
            lte(
              screeningRuns.runDate,
              format(subDays(now, REVISION_MIN_AGE_DAYS), "yyyy-MM-dd"),
            ),
          ),
        )
        .orderBy(asc(screeningRuns.id))
        .all();
      if (windowRuns.length > 0) {
        const runOrder = new Map(windowRuns.map((r, i) => [r.id, i]));
        const latestRunByTicker = new Map<string, number>();
        const rows = db
          .select({
            runId: screeningResults.runId,
            ticker: screeningResults.ticker,
            fwdEpsAvg: screeningResults.fwdEpsAvg,
            fwdEpsDate: screeningResults.fwdEpsDate,
          })
          .from(screeningResults)
          .where(
            and(
              inArray(
                screeningResults.runId,
                windowRuns.map((r) => r.id),
              ),
              inArray(screeningResults.ticker, universeTickers),
            ),
          )
          .all();
        for (const r of rows) {
          if (r.fwdEpsAvg === null || r.fwdEpsDate === null) continue;
          const order = runOrder.get(r.runId) ?? -1;
          if (order >= (latestRunByTicker.get(r.ticker) ?? -1)) {
            latestRunByTicker.set(r.ticker, order);
            priorEpsByTicker.set(r.ticker, {
              epsAvg: r.fwdEpsAvg,
              date: r.fwdEpsDate,
            });
          }
        }
      }
    }

    const settled = await mapInChunks(
      companies,
      async (companyRow) => {
        const ticker = companyRow.symbol;
        let [ratiosR, keyMetricsR, fwdEpsR, priceChangeR] = await Promise.all([
          fetchRatiosTtm(ticker),
          fetchKeyMetricsTtm(ticker),
          fetchForwardEps(ticker, todayIso),
          fetchPriceChange(ticker),
        ]);
        // One retry for the calls that FAILED (transport/HTTP) — endpoints
        // that answered with no data are not retried.
        if (!ratiosR.ok || !keyMetricsR.ok || !fwdEpsR.ok || !priceChangeR.ok) {
          [ratiosR, keyMetricsR, fwdEpsR, priceChangeR] = await Promise.all([
            ratiosR.ok ? ratiosR : fetchRatiosTtm(ticker),
            keyMetricsR.ok ? keyMetricsR : fetchKeyMetricsTtm(ticker),
            fwdEpsR.ok ? fwdEpsR : fetchForwardEps(ticker, todayIso),
            priceChangeR.ok ? priceChangeR : fetchPriceChange(ticker),
          ]);
        }

        // Any surviving failure degrades the WHOLE ticker: partial data must
        // never be ranked (a 429 on ratios would otherwise turn a name into a
        // pure-momentum entry). Degraded rows are stored all-null.
        if (!ratiosR.ok || !keyMetricsR.ok || !fwdEpsR.ok || !priceChangeR.ok) {
          return {
            companyRow,
            ratios: null,
            keyMetrics: null,
            fwdEps: null,
            fwdPe: null,
            epsGrowthFwd: null,
            epsChangeYieldFwd: null,
            priceChange: null,
            degraded: true,
            ok: false,
          };
        }
        const ratios = ratiosR.data;
        const keyMetrics = keyMetricsR.data;
        const fwdEps = fwdEpsR.data;
        const priceChange = priceChangeR.data;

        const price = companyRow.price;
        // All forward math runs off the constant-horizon NTM EPS.
        const fwdPe =
          price !== null && price > 0 && fwdEps !== null && fwdEps.ntmEpsAvg > 0
            ? price / fwdEps.ntmEpsAvg
            : null;
        // Classic growth ratio — DISPLAY column only, undefined for losses.
        const epsGrowthFwd =
          fwdEps !== null &&
          ratios?.epsTtm != null &&
          ratios.epsTtm > 0
            ? fwdEps.ntmEpsAvg / ratios.epsTtm - 1
            : null;
        // Ranked growth input — defined for loss-makers, price-scaled.
        const epsChangeYieldFwd =
          fwdEps !== null &&
          ratios?.epsTtm != null &&
          price !== null &&
          price > 0
            ? (fwdEps.ntmEpsAvg - ratios.epsTtm) / price
            : null;

        const ok =
          ratios !== null ||
          keyMetrics !== null ||
          fwdEps !== null ||
          priceChange !== null;

        return {
          companyRow,
          ratios,
          keyMetrics,
          fwdEps,
          fwdPe,
          epsGrowthFwd,
          epsChangeYieldFwd,
          priceChange,
          degraded: false,
          ok,
        };
      },
      SCREENING_CONCURRENCY,
    );

    const fetched = settled.flatMap((s) =>
      s.status === "fulfilled" ? [s.value] : [],
    );
    const degraded =
      fetched.filter((f) => f.degraded).length +
      (settled.length - fetched.length);
    if (degraded / companies.length > MAX_DEGRADED_RATE) {
      return {
        success: false,
        error: `FMP degraded — ${degraded} of ${companies.length} tickers still failing after retry; run aborted, nothing written`,
      };
    }
    const failed = fetched.filter((f) => !f.ok).length +
      (settled.length - fetched.length);

    const quantInputs: QuantMetricsInput[] = fetched.map((f) => ({
      ticker: f.companyRow.symbol,
      sector: f.companyRow.sector,
      peTtm: f.ratios?.peTtm ?? null,
      fwdPe: f.fwdPe,
      pfcfTtm: f.ratios?.pfcfTtm ?? null,
      evEbitdaTtm: f.ratios?.evEbitdaTtm ?? null,
      psTtm: f.ratios?.psTtm ?? null,
      pbTtm: f.ratios?.pbTtm ?? null,
      roicTtm: f.keyMetrics?.roicTtm ?? null,
      netMarginTtm: f.ratios?.netMarginTtm ?? null,
      debtToEquityTtm: f.ratios?.debtToEquityTtm ?? null,
      // CFO/NI is meaningless against negative earnings — null it there.
      incomeQualityTtm:
        f.ratios?.epsTtm != null && f.ratios.epsTtm > 0
          ? (f.keyMetrics?.incomeQualityTtm ?? null)
          : null,
      epsChangeYieldFwd: f.epsChangeYieldFwd,
      epsRevision: f.degraded
        ? null
        : computeEpsRevision(
            f.fwdEps,
            priorEpsByTicker.get(f.companyRow.symbol) ?? null,
          ),
      priceChange12m1m: momentum12m1m(
        f.priceChange?.change1y ?? null,
        f.priceChange?.change1m ?? null,
      ),
    }));
    const scores = computeQuantScores(quantInputs);
    const scoreByTicker = new Map(scores.map((s) => [s.ticker, s]));
    const inputByTicker = new Map(quantInputs.map((i) => [i.ticker, i]));

    const fetchedAt = now.toISOString();
    let runId = 0;
    db.transaction((tx) => {
      const runResult = tx
        .insert(screeningRuns)
        .values({
          runDate: todayIso,
          criteriaJson: JSON.stringify(criteria),
          universeCount: companies.length,
          scoredCount: fetched.length - failed,
          fetchedAt,
        })
        .run();
      runId = Number(runResult.lastInsertRowid);

      // Prune snapshots past retention in the same transaction.
      const pruneCutoff = format(subDays(now, RUN_RETENTION_DAYS), "yyyy-MM-dd");
      const expiredRuns = tx
        .select({ id: screeningRuns.id })
        .from(screeningRuns)
        .where(lt(screeningRuns.runDate, pruneCutoff))
        .all();
      if (expiredRuns.length > 0) {
        const expiredIds = expiredRuns.map((r) => r.id);
        tx.delete(screeningResults)
          .where(inArray(screeningResults.runId, expiredIds))
          .run();
        tx.delete(screeningRuns).where(inArray(screeningRuns.id, expiredIds)).run();
      }

      for (const f of fetched) {
        const q = inputByTicker.get(f.companyRow.symbol);
        const s = scoreByTicker.get(f.companyRow.symbol);
        tx.insert(screeningResults)
          .values({
            runId,
            ticker: f.companyRow.symbol,
            companyName: f.companyRow.companyName,
            sector: f.companyRow.sector,
            industry: f.companyRow.industry,
            exchange: f.companyRow.exchangeShortName,
            marketCap: f.companyRow.marketCap,
            price: f.companyRow.price,
            avgVolume: f.companyRow.volume,
            peTtm: q?.peTtm ?? null,
            fwdPe: q?.fwdPe ?? null,
            pfcfTtm: q?.pfcfTtm ?? null,
            evEbitdaTtm: q?.evEbitdaTtm ?? null,
            psTtm: q?.psTtm ?? null,
            pbTtm: q?.pbTtm ?? null,
            roeTtm: f.keyMetrics?.roeTtm ?? null,
            roicTtm: q?.roicTtm ?? null,
            netMarginTtm: q?.netMarginTtm ?? null,
            debtToEquityTtm: q?.debtToEquityTtm ?? null,
            incomeQualityTtm: q?.incomeQualityTtm ?? null,
            epsGrowthFwd: f.epsGrowthFwd,
            fwdEpsAvg: f.fwdEps?.epsAvg ?? null,
            fwdEpsDate: f.fwdEps?.date ?? null,
            epsChangeYieldFwd: q?.epsChangeYieldFwd ?? null,
            epsRevision: q?.epsRevision ?? null,
            priceChange3m: f.priceChange?.change3m ?? null,
            priceChange6m: f.priceChange?.change6m ?? null,
            priceChange12m1m: q?.priceChange12m1m ?? null,
            // Dropped from the run fan-out (20% of API cost, decorative,
            // falling-knife biased) — column kept for historical runs.
            analystUpside: null,
            valueScore: s?.valueScore ?? null,
            growthScore: s?.growthScore ?? null,
            qualityScore: s?.qualityScore ?? null,
            momentumScore: s?.momentumScore ?? null,
            compositeScore: s?.compositeScore ?? null,
          })
          .run();
      }
    });

    revalidatePath("/", "layout");
    return {
      success: true,
      data: {
        runId,
        scored: fetched.length - failed,
        failed,
        truncated: companies.length >= criteria.limit,
      },
    };
  } catch (error) {
    console.error("runScreen failed:", error);
    return {
      success: false,
      error: "Screening run failed. Please try again.",
    };
  }
}

/**
 * Flag a screened name for LLM underwriting: watchlist →
 * `flagged_for_research` AND backfill 1y of EOD history into market_data so
 * DMA/range context exists before /underwrite-name runs. Backfill failure is
 * non-fatal (graceful degradation — the flag still lands).
 */
export async function flagForResearch(
  ticker: string,
  sourceRunId?: number,
): Promise<ActionResult<{ backfilled: number }>> {
  try {
    const upper = ticker.trim().toUpperCase();
    if (upper === "") {
      return { success: false, error: "Ticker is required" };
    }

    const existing = db
      .select()
      .from(watchlist)
      .where(eq(watchlist.ticker, upper))
      .get();
    if (
      existing &&
      (existing.status === "researched" || existing.status === "watchlisted")
    ) {
      return {
        success: false,
        error: `${upper} is already ${existing.status} — manage it from the watchlist tab`,
      };
    }

    const now = new Date().toISOString();
    if (existing) {
      db.update(watchlist)
        .set({
          status: "flagged_for_research",
          sourceRunId: sourceRunId ?? existing.sourceRunId,
          updatedAt: now,
        })
        .where(eq(watchlist.id, existing.id))
        .run();
    } else {
      // Upsert: a concurrent double-flag races past the existence check —
      // the unique ticker index must land on update, not throw.
      db.insert(watchlist)
        .values({
          ticker: upper,
          status: "flagged_for_research",
          sourceRunId: sourceRunId ?? null,
          note: null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: watchlist.ticker,
          set: {
            status: "flagged_for_research",
            sourceRunId: sourceRunId ?? null,
            updatedAt: now,
          },
        })
        .run();
    }

    const fromDate = format(
      subDays(new Date(), BACKFILL_LOOKBACK_DAYS),
      "yyyy-MM-dd",
    );
    const quotes = await fetchStockPrices([upper], fromDate);
    const backfilled =
      quotes.length > 0
        ? (upsertMarketDataRows(quotes, "stock_price", now), quotes.length)
        : 0;

    revalidatePath("/", "layout");
    return { success: true, data: { backfilled } };
  } catch (error) {
    console.error("flagForResearch failed:", error);
    return {
      success: false,
      error: "Failed to flag for research. Please try again.",
    };
  }
}

/** UI status changes on the watchlist machine (legal transitions only). */
export async function setWatchlistStatus(
  ticker: string,
  status: WatchlistStatus,
): Promise<ActionResult> {
  try {
    if (!WATCHLIST_STATUSES.includes(status)) {
      return { success: false, error: "Invalid watchlist status" };
    }
    const upper = ticker.trim().toUpperCase();
    const existing = db
      .select()
      .from(watchlist)
      .where(eq(watchlist.ticker, upper))
      .get();
    if (!existing) {
      return { success: false, error: `${upper} is not on the watchlist` };
    }
    if (!WATCHLIST_TRANSITIONS[existing.status].includes(status)) {
      return {
        success: false,
        error: `Illegal transition ${existing.status} → ${status}`,
      };
    }

    db.update(watchlist)
      .set({ status, updatedAt: new Date().toISOString() })
      .where(eq(watchlist.id, existing.id))
      .run();

    revalidatePath("/", "layout");
    return { success: true, data: undefined };
  } catch (error) {
    console.error("setWatchlistStatus failed:", error);
    return {
      success: false,
      error: "Failed to update watchlist status. Please try again.",
    };
  }
}
