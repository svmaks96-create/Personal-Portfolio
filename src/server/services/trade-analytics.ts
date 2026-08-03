import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import {
  mannWhitneyU,
  summarize,
  weightedMean,
  type DistributionSummary,
  type MannWhitneyResult,
} from "@/server/services/series-utils";
import { forwardFillPriceDated } from "@/server/services/price-lookup";
import type { DailyHoldingsPoint } from "@/server/services/daily-holdings";
import type { PositionEpisode } from "@/server/types/analytics";
import type { TransactionInput, MarketDataInput } from "@/server/types/positions";

/**
 * Round-trip statistics over position episodes.
 *
 * Everything here is deliberately computed on *closed* episodes for the
 * headline, with open episodes reported separately. The censoring is not
 * symmetric: long-running winners are disproportionately still open, so
 * excluding them biases the closed sample toward shorter winners — which is
 * precisely the direction that manufactures a disposition effect. Any read of
 * the holding-period gap has to carry that caveat.
 */

export interface HoldingPeriodStats {
  all: DistributionSummary;
  winners: DistributionSummary;
  losers: DistributionSummary;
  /** median(losers) - median(winners). Positive = losers held longer. */
  medianGapDays: number | null;
  /** Same gap, weighted by capital deployed. */
  dollarWeightedGapDays: number | null;
  test: MannWhitneyResult;
  openEpisodeAges: DistributionSummary;
}

export function computeHoldingPeriodStats(
  episodes: PositionEpisode[]
): HoldingPeriodStats {
  const closed = episodes.filter((e) => !e.isOpen && e.outcome !== "unknown");
  const winners = closed.filter((e) => e.outcome === "win");
  const losers = closed.filter((e) => e.outcome === "loss");

  const days = (list: PositionEpisode[]) => list.map((e) => e.holdingDays);
  const capital = (list: PositionEpisode[]) => list.map((e) => e.totalInvestedUsd);

  const winnerMedian = summarize(days(winners)).median;
  const loserMedian = summarize(days(losers)).median;
  const winnerDw = weightedMean(days(winners), capital(winners));
  const loserDw = weightedMean(days(losers), capital(losers));

  return {
    all: summarize(days(closed)),
    winners: summarize(days(winners)),
    losers: summarize(days(losers)),
    medianGapDays:
      winnerMedian === null || loserMedian === null ? null : loserMedian - winnerMedian,
    dollarWeightedGapDays:
      winnerDw === null || loserDw === null ? null : loserDw - winnerDw,
    test: mannWhitneyU(days(winners), days(losers)),
    openEpisodeAges: summarize(episodes.filter((e) => e.isOpen).map((e) => e.holdingDays)),
  };
}

export interface WinLossStats {
  n: number;
  wins: number;
  losses: number;
  flats: number;
  /** Flats excluded from the denominator. */
  winRatePct: number | null;
  avgWinPct: number | null;
  avgLossPct: number | null;
  winLossRatio: number | null;
  expectancyPct: number | null;
  totalWinUsd: number;
  totalLossUsd: number;
  avgWinUsd: number | null;
  avgLossUsd: number | null;
  profitFactor: number | null;
  expectancyPerEpisodeUsd: number | null;
  totalInvestedUsd: number;
  totalPnlUsd: number;
  /** Share of capital deployed that went into eventual winners. */
  winRateByDollarsPct: number | null;
}

export function computeWinLossStats(episodes: PositionEpisode[]): WinLossStats {
  const scored = episodes.filter((e) => e.outcome !== "unknown");
  const wins = scored.filter((e) => e.outcome === "win");
  const losses = scored.filter((e) => e.outcome === "loss");
  const flats = scored.filter((e) => e.outcome === "flat");
  const decided = wins.length + losses.length;

  const pct = (list: PositionEpisode[]) =>
    list.map((e) => e.totalReturnPct).filter((v): v is number => v !== null);
  const avg = (list: number[]) =>
    list.length === 0 ? null : list.reduce((a, b) => a + b, 0) / list.length;

  const avgWinPct = avg(pct(wins));
  const avgLossPct = avg(pct(losses));
  const winRate = decided === 0 ? null : wins.length / decided;

  const totalWinUsd = wins.reduce((a, e) => a + (e.totalPnlUsd ?? 0), 0);
  const totalLossUsd = losses.reduce((a, e) => a + (e.totalPnlUsd ?? 0), 0);
  const totalInvestedUsd = scored.reduce((a, e) => a + e.totalInvestedUsd, 0);
  const winnerCapital = wins.reduce((a, e) => a + e.totalInvestedUsd, 0);

  return {
    n: scored.length,
    wins: wins.length,
    losses: losses.length,
    flats: flats.length,
    winRatePct: winRate === null ? null : winRate * 100,
    avgWinPct,
    avgLossPct,
    winLossRatio:
      avgWinPct === null || avgLossPct === null || avgLossPct === 0
        ? null
        : Math.abs(avgWinPct / avgLossPct),
    expectancyPct:
      winRate === null || avgWinPct === null || avgLossPct === null
        ? null
        : winRate * avgWinPct + (1 - winRate) * avgLossPct,
    totalWinUsd,
    totalLossUsd,
    avgWinUsd: wins.length ? totalWinUsd / wins.length : null,
    avgLossUsd: losses.length ? totalLossUsd / losses.length : null,
    profitFactor:
      totalLossUsd === 0 ? null : Math.abs(totalWinUsd / totalLossUsd),
    expectancyPerEpisodeUsd:
      scored.length === 0 ? null : (totalWinUsd + totalLossUsd) / scored.length,
    totalInvestedUsd,
    totalPnlUsd: scored.reduce((a, e) => a + (e.totalPnlUsd ?? 0), 0),
    winRateByDollarsPct:
      totalInvestedUsd === 0 ? null : (winnerCapital / totalInvestedUsd) * 100,
  };
}

export type AveragingCohort = "single-shot" | "only-added-up" | "added-down";

export interface AveragingCohortStats {
  cohort: AveragingCohort;
  n: number;
  winRatePct: number | null;
  meanReturnPct: number | null;
  medianReturnPct: number | null;
  totalPnlUsd: number;
  totalInvestedUsd: number;
}

export interface AveragingStats {
  addsAboveAvgCost: number;
  addsBelowAvgCost: number;
  addUpUsd: number;
  addDownUsd: number;
  meanVsAvgCostPct: number | null;
  cohorts: AveragingCohortStats[];
}

/**
 * Splits episodes by how capital was added, then reports the payoff of each
 * cohort. The counts alone only describe a habit; the cohort returns are what
 * turn it into a verdict on whether averaging down works for this operator.
 */
export function computeAveragingBehavior(episodes: PositionEpisode[]): AveragingStats {
  const scored = episodes.filter((e) => e.outcome !== "unknown");

  const vsAvg: number[] = [];
  for (const e of scored) {
    for (const t of e.trades) {
      if (t.action === "buy" && t.vsAvgCostPct !== null) vsAvg.push(t.vsAvgCostPct);
    }
  }

  const classify = (e: PositionEpisode): AveragingCohort => {
    if (e.addCount === 0) return "single-shot";
    return e.addsBelowAvgCost > 0 ? "added-down" : "only-added-up";
  };

  const cohorts: AveragingCohortStats[] = (
    ["single-shot", "only-added-up", "added-down"] as AveragingCohort[]
  ).map((cohort) => {
    const list = scored.filter((e) => classify(e) === cohort);
    const decided = list.filter((e) => e.outcome === "win" || e.outcome === "loss");
    const returns = list
      .map((e) => e.totalReturnPct)
      .filter((v): v is number => v !== null);
    const s = summarize(returns);
    return {
      cohort,
      n: list.length,
      winRatePct:
        decided.length === 0
          ? null
          : (decided.filter((e) => e.outcome === "win").length / decided.length) * 100,
      meanReturnPct: s.mean,
      medianReturnPct: s.median,
      totalPnlUsd: list.reduce((a, e) => a + (e.totalPnlUsd ?? 0), 0),
      totalInvestedUsd: list.reduce((a, e) => a + e.totalInvestedUsd, 0),
    };
  });

  return {
    addsAboveAvgCost: scored.reduce((a, e) => a + e.addsAboveAvgCost, 0),
    addsBelowAvgCost: scored.reduce((a, e) => a + e.addsBelowAvgCost, 0),
    addUpUsd: scored.reduce((a, e) => a + e.addUpUsd, 0),
    addDownUsd: scored.reduce((a, e) => a + e.addDownUsd, 0),
    meanVsAvgCostPct: summarize(vsAvg).mean,
    cohorts,
  };
}

export interface TurnoverYear {
  year: number;
  buysUsd: number;
  sellsUsd: number;
  buysExTransferUsd: number;
  sellsExTransferUsd: number;
  transferUsd: number;
  avgAumUsd: number;
  /** min(buys, sells) / avgAum, ex-transfer. The Morningstar convention. */
  turnoverRatio: number | null;
  /** sells / avgAum, ex-transfer. Immune to contributions. */
  oneWayTurnover: number | null;
  tradeCount: number;
  tradeDays: number;
  isPartialYear: boolean;
}

export interface TurnoverOptions {
  /** Matched transfer quantity per transaction id, from detectTransferPairs. */
  transferMatchedQtyByTxId?: ReadonlyMap<number, number>;
  /** Last date with data, used to flag a partial trailing year. */
  asOf: string;
}

/**
 * Turnover against an average-AUM denominator rather than absolute dollars.
 *
 * The book grew from about $1k to $331k, so raw gross traded says almost
 * nothing. Transfers are netted by *matched notional*, not by dropping whole
 * rows: when 22.8 shares are sold and 20 are re-bought elsewhere, 20 moved and
 * the 2.8 residual is a real sale.
 */
export function computeTurnover(
  transactions: TransactionInput[],
  points: DailyHoldingsPoint[],
  options: TurnoverOptions
): TurnoverYear[] {
  const { transferMatchedQtyByTxId, asOf } = options;

  const aumByYear = new Map<number, { sum: Decimal; n: number }>();
  for (const p of points) {
    const year = Number(p.date.slice(0, 4));
    const acc = aumByYear.get(year) ?? { sum: new Decimal(0), n: 0 };
    acc.sum = acc.sum.plus(p.totalMarketValueUsd);
    acc.n += 1;
    aumByYear.set(year, acc);
  }

  interface Acc {
    buys: Decimal;
    sells: Decimal;
    buysEx: Decimal;
    sellsEx: Decimal;
    transfer: Decimal;
    trades: number;
    days: Set<string>;
  }
  const byYear = new Map<number, Acc>();
  const accFor = (year: number): Acc => {
    let a = byYear.get(year);
    if (!a) {
      a = {
        buys: new Decimal(0),
        sells: new Decimal(0),
        buysEx: new Decimal(0),
        sellsEx: new Decimal(0),
        transfer: new Decimal(0),
        trades: 0,
        days: new Set<string>(),
      };
      byYear.set(year, a);
    }
    return a;
  };

  for (const t of transactions) {
    if (t.action !== "buy" && t.action !== "sell") continue;
    const year = Number(t.date.slice(0, 4));
    const acc = accFor(year);
    const gross = new Decimal(t.grossAmount);

    const matchedQty = transferMatchedQtyByTxId?.get(t.id) ?? 0;
    const transferShare =
      t.quantity > 0 ? Math.min(1, matchedQty / t.quantity) : 0;
    const transferUsd = gross.times(transferShare);
    const realUsd = gross.minus(transferUsd);

    acc.trades += 1;
    acc.days.add(t.date);
    acc.transfer = acc.transfer.plus(transferUsd);
    if (t.action === "buy") {
      acc.buys = acc.buys.plus(gross);
      acc.buysEx = acc.buysEx.plus(realUsd);
    } else {
      acc.sells = acc.sells.plus(gross);
      acc.sellsEx = acc.sellsEx.plus(realUsd);
    }
  }

  const asOfYear = Number(asOf.slice(0, 4));
  const rows: TurnoverYear[] = [];
  for (const [year, acc] of [...byYear].sort((a, b) => a[0] - b[0])) {
    const aum = aumByYear.get(year);
    const avgAum = aum && aum.n > 0 ? aum.sum.div(aum.n).toNumber() : 0;
    const buysEx = acc.buysEx.toNumber();
    const sellsEx = acc.sellsEx.toNumber();
    rows.push({
      year,
      buysUsd: acc.buys.toNumber(),
      sellsUsd: acc.sells.toNumber(),
      buysExTransferUsd: buysEx,
      sellsExTransferUsd: sellsEx,
      transferUsd: acc.transfer.toNumber(),
      avgAumUsd: avgAum,
      turnoverRatio: avgAum > 0 ? Math.min(buysEx, sellsEx) / avgAum : null,
      oneWayTurnover: avgAum > 0 ? sellsEx / avgAum : null,
      tradeCount: acc.trades,
      tradeDays: acc.days.size,
      isPartialYear: year === asOfYear,
    });
  }
  return rows;
}

export interface OutOfMarketEpisode {
  startDate: string;
  endDate: string;
  days: number;
  /** Peak capital withdrawn from the market during the gap. */
  capitalOutUsd: number;
  benchmarkReturnPct: number | null;
  /** capitalOut × benchmark return — the return forgone while in cash. */
  estimatedDragUsd: number | null;
}

export interface OutOfMarketOptions {
  /** Ignore withdrawals smaller than this. */
  minCapitalUsd?: number;
  benchmarkSeries?: MarketDataInput[];
}

/**
 * Finds windows where committed capital dropped below its own high-water mark
 * and later recovered — i.e. money was pulled out of the market and put back.
 *
 * Deliberately inferred from the flow record rather than assumed, because the
 * DB has no cash account: capital sitting idle is invisible to both market
 * value and TWRR. The drag figure is what that invisibility costs.
 */
export function computeOutOfMarketEpisodes(
  points: DailyHoldingsPoint[],
  options: OutOfMarketOptions = {}
): OutOfMarketEpisode[] {
  const { minCapitalUsd = 5000, benchmarkSeries } = options;
  const sortedBenchmark = benchmarkSeries
    ? [...benchmarkSeries].sort((a, b) => a.date.localeCompare(b.date))
    : null;

  let cumulative = new Decimal(0);
  let highWater = new Decimal(0);
  let gapStart: string | null = null;
  let deepest = new Decimal(0);

  const out: OutOfMarketEpisode[] = [];

  for (const p of points) {
    cumulative = cumulative.plus(p.totalExternalFlowUsd);
    const shortfall = highWater.minus(cumulative);

    if (gapStart === null) {
      if (shortfall.greaterThan(minCapitalUsd)) {
        gapStart = p.date;
        deepest = shortfall;
      }
    } else {
      if (shortfall.greaterThan(deepest)) deepest = shortfall;
      if (shortfall.lessThanOrEqualTo(0)) {
        out.push(buildEpisode(gapStart, p.date, deepest, sortedBenchmark));
        gapStart = null;
        deepest = new Decimal(0);
      }
    }

    if (cumulative.greaterThan(highWater)) highWater = cumulative;
  }

  // A gap still open at the end of the data is reported as unresolved.
  if (gapStart !== null && points.length > 0) {
    out.push(
      buildEpisode(gapStart, points[points.length - 1].date, deepest, sortedBenchmark)
    );
  }

  return out;
}

export interface ClusterBucket {
  label: string;
  tradeCount: number;
  buyUsd: number;
  sellUsd: number;
  shareOfBuyDollarsPct: number | null;
  shareOfSellDollarsPct: number | null;
}

export interface TradeClusteringResult {
  byDrawdownState: ClusterBucket[];
  byBenchmarkMomentum: ClusterBucket[];
  topTradeDays: {
    date: string;
    grossUsd: number;
    tradeCount: number;
    portfolioDrawdownPct: number | null;
  }[];
  byYear: { year: number; trades: number; tradeDays: number; grossUsd: number }[];
  coverage: { n: number; withDrawdownState: number; withMomentum: number };
}

export interface TradeClusteringOptions {
  /** Portfolio growth-of-a-dollar series, for drawdown state on each trade date. */
  portfolioSeries: { date: string; growthOfDollar: number }[];
  benchmarkSeries?: MarketDataInput[];
  /** Trailing window, in observations, for benchmark momentum. */
  momentumBars?: number;
  excludeTxIds?: ReadonlySet<number>;
  topN?: number;
}

/**
 * Do trades cluster into drawdowns or into rallies?
 *
 * Buckets buy and sell **dollars** — not trade counts — by the portfolio's own
 * drawdown state and by the benchmark's recent momentum on each trade date.
 * Counting trades would let a scatter of tiny orders outweigh one large
 * conviction purchase, which is the opposite of what the question is asking.
 */
export function computeTradeClustering(
  transactions: TransactionInput[],
  options: TradeClusteringOptions
): TradeClusteringResult {
  const {
    portfolioSeries,
    benchmarkSeries,
    momentumBars = 20,
    excludeTxIds,
    topN = 10,
  } = options;

  // Drawdown from the running peak, per date.
  const drawdownByDate = new Map<string, number>();
  let peak = -Infinity;
  for (const p of portfolioSeries) {
    peak = Math.max(peak, p.growthOfDollar);
    drawdownByDate.set(p.date, peak > 0 ? (p.growthOfDollar / peak - 1) * 100 : 0);
  }

  const benchmark = benchmarkSeries
    ? [...benchmarkSeries].sort((a, b) => a.date.localeCompare(b.date))
    : null;
  const momentumByDate = new Map<string, number>();
  if (benchmark) {
    for (let i = momentumBars; i < benchmark.length; i += 1) {
      const then = benchmark[i - momentumBars].value;
      if (then === 0) continue;
      momentumByDate.set(benchmark[i].date, (benchmark[i].value / then - 1) * 100);
    }
  }

  const lookupBefore = (map: Map<string, number>, date: string): number | null => {
    if (map.has(date)) return map.get(date) ?? null;
    let best: number | null = null;
    let bestDate = "";
    for (const [d, v] of map) {
      if (d <= date && d > bestDate) {
        bestDate = d;
        best = v;
      }
    }
    return best;
  };

  const trades = transactions.filter(
    (t) =>
      (t.action === "buy" || t.action === "sell") &&
      !(excludeTxIds?.has(t.id) ?? false)
  );

  const totalBuy = trades
    .filter((t) => t.action === "buy")
    .reduce((a, t) => a + t.grossAmount, 0);
  const totalSell = trades
    .filter((t) => t.action === "sell")
    .reduce((a, t) => a + t.grossAmount, 0);

  const bucketize = (
    labels: { label: string; test: (v: number) => boolean }[],
    valueFor: (date: string) => number | null
  ): { buckets: ClusterBucket[]; covered: number } => {
    const acc = labels.map((l) => ({
      label: l.label,
      tradeCount: 0,
      buyUsd: 0,
      sellUsd: 0,
      shareOfBuyDollarsPct: null as number | null,
      shareOfSellDollarsPct: null as number | null,
    }));
    let covered = 0;
    for (const t of trades) {
      const v = valueFor(t.date);
      if (v === null) continue;
      const idx = labels.findIndex((l) => l.test(v));
      if (idx === -1) continue;
      covered += 1;
      acc[idx].tradeCount += 1;
      if (t.action === "buy") acc[idx].buyUsd += t.grossAmount;
      else acc[idx].sellUsd += t.grossAmount;
    }
    for (const b of acc) {
      b.shareOfBuyDollarsPct = totalBuy === 0 ? null : (b.buyUsd / totalBuy) * 100;
      b.shareOfSellDollarsPct = totalSell === 0 ? null : (b.sellUsd / totalSell) * 100;
    }
    return { buckets: acc, covered };
  };

  const drawdown = bucketize(
    [
      { label: "Deep drawdown (worse than -10%)", test: (v) => v <= -10 },
      { label: "Moderate drawdown (-10% to -5%)", test: (v) => v <= -5 },
      { label: "Shallow drawdown (-5% to -1%)", test: (v) => v <= -1 },
      { label: "At or near a high (better than -1%)", test: () => true },
    ],
    (date) => lookupBefore(drawdownByDate, date)
  );

  const momentum = bucketize(
    [
      { label: "Benchmark fell more than 5%", test: (v) => v <= -5 },
      { label: "Benchmark fell 0-5%", test: (v) => v <= 0 },
      { label: "Benchmark rose 0-5%", test: (v) => v <= 5 },
      { label: "Benchmark rose more than 5%", test: () => true },
    ],
    (date) => lookupBefore(momentumByDate, date)
  );

  const byDate = new Map<string, { grossUsd: number; tradeCount: number }>();
  for (const t of trades) {
    const e = byDate.get(t.date) ?? { grossUsd: 0, tradeCount: 0 };
    e.grossUsd += t.grossAmount;
    e.tradeCount += 1;
    byDate.set(t.date, e);
  }

  const byYear = new Map<number, { trades: number; days: Set<string>; grossUsd: number }>();
  for (const t of trades) {
    const year = Number(t.date.slice(0, 4));
    const e = byYear.get(year) ?? { trades: 0, days: new Set<string>(), grossUsd: 0 };
    e.trades += 1;
    e.days.add(t.date);
    e.grossUsd += t.grossAmount;
    byYear.set(year, e);
  }

  return {
    byDrawdownState: drawdown.buckets,
    byBenchmarkMomentum: momentum.buckets,
    topTradeDays: [...byDate]
      .map(([date, v]) => ({
        date,
        grossUsd: v.grossUsd,
        tradeCount: v.tradeCount,
        portfolioDrawdownPct: lookupBefore(drawdownByDate, date),
      }))
      .sort((a, b) => b.grossUsd - a.grossUsd)
      .slice(0, topN),
    byYear: [...byYear]
      .sort((a, b) => a[0] - b[0])
      .map(([year, v]) => ({
        year,
        trades: v.trades,
        tradeDays: v.days.size,
        grossUsd: v.grossUsd,
      })),
    coverage: {
      n: trades.length,
      withDrawdownState: drawdown.covered,
      withMomentum: momentum.covered,
    },
  };
}

function buildEpisode(
  startDate: string,
  endDate: string,
  capitalOut: Decimal,
  benchmark: MarketDataInput[] | null
): OutOfMarketEpisode {
  let benchmarkReturnPct: number | null = null;
  if (benchmark) {
    const a = forwardFillPriceDated(benchmark, startDate);
    const b = forwardFillPriceDated(benchmark, endDate);
    if (a && b && a.value > 0) benchmarkReturnPct = (b.value / a.value - 1) * 100;
  }
  const capital = capitalOut.toNumber();
  return {
    startDate,
    endDate,
    days: differenceInDays(parseISO(endDate), parseISO(startDate)),
    capitalOutUsd: capital,
    benchmarkReturnPct,
    estimatedDragUsd:
      benchmarkReturnPct === null ? null : (capital * benchmarkReturnPct) / 100,
  };
}
