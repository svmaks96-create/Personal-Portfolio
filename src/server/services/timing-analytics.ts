import { addDays, format, parseISO } from "date-fns";
import { lastIndexAtOrBefore } from "@/server/services/price-lookup";
import { mean, summarize, type DistributionSummary } from "@/server/services/series-utils";
import type { PositionEpisode } from "@/server/types/analytics";
import type { TransactionInput, MarketDataInput } from "@/server/types/positions";

/**
 * Was each trade well timed?
 *
 * Entry quality compares the actual fill against the name's own moving
 * averages and recent relative strength — dip-buying versus chasing. Exit
 * quality asks what happened next, measured against SPY rather than cash,
 * because the alternative to holding a stock is usually owning the index, not
 * sitting flat.
 *
 * The rule that matters most here is what happens to incomplete data. A sale
 * made three weeks ago has no 180-day forward return yet. Truncating it to
 * "return so far" would quietly bias every long-horizon bucket toward recent
 * trades, so incomplete windows are **excluded from aggregates and counted**,
 * never silently shortened. Coverage is reported everywhere for the same
 * reason: several names have too little history for a 200-day average, and a
 * statistic computed over an unstated subset is worse than no statistic.
 */

export const SMA_SHORT = 50;
export const SMA_LONG = 200;
export const TRAILING_3M_DAYS = 63;
export const LOOKBACK_52W_DAYS = 252;
export const DEFAULT_EXIT_HORIZONS = [30, 90, 180];

export interface EntryTimingRow {
  txId: number;
  date: string;
  ticker: string;
  portfolio: string;
  quantity: number;
  grossUsd: number;
  /** grossAmount / quantity — the actual fill, not that day's close. */
  fillPrice: number;
  closePrice: number | null;
  sma50: number | null;
  sma200: number | null;
  pctVs50dma: number | null;
  pctVs200dma: number | null;
  trailing3mReturnPct: number | null;
  trailing3mVsSpyPct: number | null;
  drawdownFrom52wHighPct: number | null;
  /** Outcome of the episode this buy belongs to, when known. */
  episodeOutcome: PositionEpisode["outcome"] | null;
  episodeReturnPct: number | null;
}

export interface EntryCoverage {
  n: number;
  withClose: number;
  withSma50: number;
  withSma200: number;
  withTrailing3m: number;
  missingByTicker: { ticker: string; missingSma200: number; buys: number }[];
}

export interface EntryOutcomeCut {
  label: string;
  n: number;
  dollarsUsd: number;
  winRatePct: number | null;
  meanEpisodeReturnPct: number | null;
}

export interface EntryTimingResult {
  rows: EntryTimingRow[];
  coverage: EntryCoverage;
  /** Share of buy DOLLARS, not of trade count. */
  dollarsAbove50dmaPct: number | null;
  dollarsAbove200dmaPct: number | null;
  meanPctVs50dma: number | null;
  meanPctVs200dma: number | null;
  distributionVs200dma: DistributionSummary;
  outcomeCuts: EntryOutcomeCut[];
}

interface Lookup {
  sorted: MarketDataInput[];
}

function buildLookups(
  priceHistory: Record<string, MarketDataInput[]>
): Map<string, Lookup> {
  const out = new Map<string, Lookup>();
  for (const [symbol, rows] of Object.entries(priceHistory)) {
    out.set(symbol, {
      sorted: [...rows].sort((a, b) => a.date.localeCompare(b.date)),
    });
  }
  return out;
}

/** Simple moving average over the `window` observations ending at `date`. */
function smaAt(sorted: MarketDataInput[], date: string, window: number): number | null {
  const idx = lastIndexAtOrBefore(sorted, date);
  if (idx === -1 || idx + 1 < window) return null;
  let sum = 0;
  for (let i = idx - window + 1; i <= idx; i += 1) sum += sorted[i].value;
  return sum / window;
}

function valueAt(sorted: MarketDataInput[], date: string): number | null {
  const idx = lastIndexAtOrBefore(sorted, date);
  return idx === -1 ? null : sorted[idx].value;
}

/** Return over the previous `bars` observations ending at `date`. */
function trailingReturn(
  sorted: MarketDataInput[],
  date: string,
  bars: number
): number | null {
  const idx = lastIndexAtOrBefore(sorted, date);
  if (idx === -1 || idx < bars) return null;
  const then = sorted[idx - bars].value;
  if (then === 0) return null;
  return (sorted[idx].value / then - 1) * 100;
}

function drawdownFromHigh(
  sorted: MarketDataInput[],
  date: string,
  bars: number
): number | null {
  const idx = lastIndexAtOrBefore(sorted, date);
  if (idx === -1) return null;
  const start = Math.max(0, idx - bars + 1);
  let high = -Infinity;
  for (let i = start; i <= idx; i += 1) high = Math.max(high, sorted[i].value);
  if (high <= 0) return null;
  return (sorted[idx].value / high - 1) * 100;
}

export interface EntryTimingOptions {
  priceHistory: Record<string, MarketDataInput[]>;
  benchmarkSeries: MarketDataInput[];
  episodes?: PositionEpisode[];
  /** Transfer legs to exclude — a relocation is not an entry decision. */
  excludeTxIds?: ReadonlySet<number>;
}

export function computeEntryTiming(
  transactions: TransactionInput[],
  options: EntryTimingOptions
): EntryTimingResult {
  const { priceHistory, benchmarkSeries, episodes = [], excludeTxIds } = options;
  const lookups = buildLookups(priceHistory);
  const benchmark = [...benchmarkSeries].sort((a, b) => a.date.localeCompare(b.date));

  const episodeByTxId = new Map<number, PositionEpisode>();
  for (const e of episodes) {
    for (const t of e.trades) episodeByTxId.set(t.txId, e);
  }

  const buys = transactions.filter(
    (t) =>
      t.action === "buy" &&
      t.instrument === "stock" &&
      t.quantity > 0 &&
      !(excludeTxIds?.has(t.id) ?? false)
  );

  const rows: EntryTimingRow[] = [];
  for (const t of buys) {
    const lookup = lookups.get(t.ticker);
    const sorted = lookup?.sorted ?? [];
    const fillPrice = t.grossAmount / t.quantity;
    const sma50 = smaAt(sorted, t.date, SMA_SHORT);
    const sma200 = smaAt(sorted, t.date, SMA_LONG);
    const trailing = trailingReturn(sorted, t.date, TRAILING_3M_DAYS);
    const spyTrailing = trailingReturn(benchmark, t.date, TRAILING_3M_DAYS);
    const episode = episodeByTxId.get(t.id) ?? null;

    rows.push({
      txId: t.id,
      date: t.date,
      ticker: t.ticker,
      portfolio: t.portfolio,
      quantity: t.quantity,
      grossUsd: t.grossAmount,
      fillPrice,
      closePrice: valueAt(sorted, t.date),
      sma50,
      sma200,
      pctVs50dma: sma50 === null || sma50 === 0 ? null : (fillPrice / sma50 - 1) * 100,
      pctVs200dma:
        sma200 === null || sma200 === 0 ? null : (fillPrice / sma200 - 1) * 100,
      trailing3mReturnPct: trailing,
      trailing3mVsSpyPct:
        trailing === null || spyTrailing === null ? null : trailing - spyTrailing,
      drawdownFrom52wHighPct: drawdownFromHigh(sorted, t.date, LOOKBACK_52W_DAYS),
      episodeOutcome: episode?.outcome ?? null,
      episodeReturnPct: episode?.totalReturnPct ?? null,
    });
  }

  const missingByTicker = new Map<string, { missingSma200: number; buys: number }>();
  for (const r of rows) {
    const e = missingByTicker.get(r.ticker) ?? { missingSma200: 0, buys: 0 };
    e.buys += 1;
    if (r.sma200 === null) e.missingSma200 += 1;
    missingByTicker.set(r.ticker, e);
  }

  const dollarShare = (predicate: (r: EntryTimingRow) => boolean, has: (r: EntryTimingRow) => boolean) => {
    const eligible = rows.filter(has);
    const total = eligible.reduce((a, r) => a + r.grossUsd, 0);
    if (total === 0) return null;
    return (
      (eligible.filter(predicate).reduce((a, r) => a + r.grossUsd, 0) / total) * 100
    );
  };

  const cut = (label: string, subset: EntryTimingRow[]): EntryOutcomeCut => {
    const decided = subset.filter(
      (r) => r.episodeOutcome === "win" || r.episodeOutcome === "loss"
    );
    return {
      label,
      n: subset.length,
      dollarsUsd: subset.reduce((a, r) => a + r.grossUsd, 0),
      winRatePct:
        decided.length === 0
          ? null
          : (decided.filter((r) => r.episodeOutcome === "win").length / decided.length) *
            100,
      meanEpisodeReturnPct: mean(
        subset.map((r) => r.episodeReturnPct).filter((v): v is number => v !== null)
      ),
    };
  };

  const withSma200 = rows.filter((r) => r.pctVs200dma !== null);

  return {
    rows,
    coverage: {
      n: rows.length,
      withClose: rows.filter((r) => r.closePrice !== null).length,
      withSma50: rows.filter((r) => r.sma50 !== null).length,
      withSma200: withSma200.length,
      withTrailing3m: rows.filter((r) => r.trailing3mReturnPct !== null).length,
      missingByTicker: [...missingByTicker]
        .filter(([, v]) => v.missingSma200 > 0)
        .map(([ticker, v]) => ({ ticker, ...v }))
        .sort((a, b) => b.missingSma200 - a.missingSma200),
    },
    dollarsAbove50dmaPct: dollarShare(
      (r) => (r.pctVs50dma ?? 0) > 0,
      (r) => r.pctVs50dma !== null
    ),
    dollarsAbove200dmaPct: dollarShare(
      (r) => (r.pctVs200dma ?? 0) > 0,
      (r) => r.pctVs200dma !== null
    ),
    meanPctVs50dma: mean(
      rows.map((r) => r.pctVs50dma).filter((v): v is number => v !== null)
    ),
    meanPctVs200dma: mean(withSma200.map((r) => r.pctVs200dma as number)),
    distributionVs200dma: summarize(withSma200.map((r) => r.pctVs200dma as number)),
    outcomeCuts: [
      cut("Bought above the 200-DMA", withSma200.filter((r) => (r.pctVs200dma ?? 0) > 0)),
      cut("Bought below the 200-DMA", withSma200.filter((r) => (r.pctVs200dma ?? 0) <= 0)),
      cut(
        "Bought after a 3m gain vs SPY",
        rows.filter((r) => (r.trailing3mVsSpyPct ?? 0) > 0 && r.trailing3mVsSpyPct !== null)
      ),
      cut(
        "Bought after a 3m lag vs SPY",
        rows.filter((r) => r.trailing3mVsSpyPct !== null && r.trailing3mVsSpyPct <= 0)
      ),
    ],
  };
}

export interface ExitHorizonPoint {
  days: number;
  targetDate: string;
  forwardReturnPct: number | null;
  benchmarkReturnPct: number | null;
  excessPct: number | null;
  /** proceeds × excess — what staying in would have been worth vs the index. */
  regretUsd: number | null;
  /** False when the horizon extends past available price data. */
  windowComplete: boolean;
}

export interface ExitTimingRow {
  txId: number;
  date: string;
  ticker: string;
  portfolio: string;
  quantity: number;
  exitPrice: number;
  proceedsUsd: number;
  exitType: "trim" | "full-exit";
  horizons: ExitHorizonPoint[];
}

export interface ExitHorizonSummary {
  days: number;
  n: number;
  nComplete: number;
  nIncompleteExcluded: number;
  meanForwardReturnPct: number | null;
  meanBenchmarkReturnPct: number | null;
  meanExcessPct: number | null;
  medianExcessPct: number | null;
  /** Positive means selling was costly relative to holding the index. */
  totalRegretUsd: number;
  soldTooEarlyCount: number;
  soldWellCount: number;
}

export interface ExitTimingResult {
  rows: ExitTimingRow[];
  byHorizon: ExitHorizonSummary[];
  byExitType: { exitType: string; days: number; n: number; meanExcessPct: number | null }[];
}

export interface ExitTimingOptions {
  priceHistory: Record<string, MarketDataInput[]>;
  benchmarkSeries: MarketDataInput[];
  horizons?: number[];
  excludeTxIds?: ReadonlySet<number>;
  /** Full-exit detection: transaction ids that closed an episode. */
  closingTxIds?: ReadonlySet<number>;
}

export function computeExitTiming(
  transactions: TransactionInput[],
  options: ExitTimingOptions
): ExitTimingResult {
  const {
    priceHistory,
    benchmarkSeries,
    horizons = DEFAULT_EXIT_HORIZONS,
    excludeTxIds,
    closingTxIds,
  } = options;

  const lookups = buildLookups(priceHistory);
  const benchmark = [...benchmarkSeries].sort((a, b) => a.date.localeCompare(b.date));
  const benchmarkLast = benchmark[benchmark.length - 1]?.date ?? "";

  const sells = transactions.filter(
    (t) =>
      t.action === "sell" &&
      t.instrument === "stock" &&
      t.quantity > 0 &&
      !(excludeTxIds?.has(t.id) ?? false)
  );

  const rows: ExitTimingRow[] = [];
  for (const t of sells) {
    const sorted = lookups.get(t.ticker)?.sorted ?? [];
    const tickerLast = sorted[sorted.length - 1]?.date ?? "";
    const exitPrice = t.grossAmount / t.quantity;
    const spyAtExit = valueAt(benchmark, t.date);

    const points: ExitHorizonPoint[] = [];
    for (const days of horizons) {
      const targetDate = format(addDays(parseISO(t.date), days), "yyyy-MM-dd");
      const complete = targetDate <= tickerLast && targetDate <= benchmarkLast;

      const future = valueAt(sorted, targetDate);
      const spyFuture = valueAt(benchmark, targetDate);
      const forwardReturnPct =
        future === null || exitPrice === 0 ? null : (future / exitPrice - 1) * 100;
      const benchmarkReturnPct =
        spyFuture === null || spyAtExit === null || spyAtExit === 0
          ? null
          : (spyFuture / spyAtExit - 1) * 100;
      const excessPct =
        forwardReturnPct === null || benchmarkReturnPct === null
          ? null
          : forwardReturnPct - benchmarkReturnPct;

      points.push({
        days,
        targetDate,
        forwardReturnPct: complete ? forwardReturnPct : null,
        benchmarkReturnPct: complete ? benchmarkReturnPct : null,
        excessPct: complete ? excessPct : null,
        regretUsd:
          complete && excessPct !== null
            ? (t.grossAmount * excessPct) / 100
            : null,
        windowComplete: complete,
      });
    }

    rows.push({
      txId: t.id,
      date: t.date,
      ticker: t.ticker,
      portfolio: t.portfolio,
      quantity: t.quantity,
      exitPrice,
      proceedsUsd: t.grossAmount,
      exitType: closingTxIds?.has(t.id) ? "full-exit" : "trim",
      horizons: points,
    });
  }

  const byHorizon: ExitHorizonSummary[] = horizons.map((days) => {
    const points = rows
      .map((r) => r.horizons.find((h) => h.days === days))
      .filter((h): h is ExitHorizonPoint => h !== undefined);
    const complete = points.filter((h) => h.windowComplete && h.excessPct !== null);
    const excess = complete.map((h) => h.excessPct as number);

    return {
      days,
      n: points.length,
      nComplete: complete.length,
      nIncompleteExcluded: points.length - complete.length,
      meanForwardReturnPct: mean(
        complete.map((h) => h.forwardReturnPct).filter((v): v is number => v !== null)
      ),
      meanBenchmarkReturnPct: mean(
        complete.map((h) => h.benchmarkReturnPct).filter((v): v is number => v !== null)
      ),
      meanExcessPct: mean(excess),
      medianExcessPct: summarize(excess).median,
      totalRegretUsd: complete.reduce((a, h) => a + (h.regretUsd ?? 0), 0),
      soldTooEarlyCount: excess.filter((v) => v > 0).length,
      soldWellCount: excess.filter((v) => v <= 0).length,
    };
  });

  const byExitType: ExitTimingResult["byExitType"] = [];
  for (const exitType of ["trim", "full-exit"] as const) {
    for (const days of horizons) {
      const subset = rows
        .filter((r) => r.exitType === exitType)
        .map((r) => r.horizons.find((h) => h.days === days))
        .filter((h): h is ExitHorizonPoint => h !== undefined && h.windowComplete);
      byExitType.push({
        exitType,
        days,
        n: subset.length,
        meanExcessPct: mean(
          subset.map((h) => h.excessPct).filter((v): v is number => v !== null)
        ),
      });
    }
  }

  return { rows, byHorizon, byExitType };
}
