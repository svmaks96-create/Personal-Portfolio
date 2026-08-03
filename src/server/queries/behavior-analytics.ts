import { cache } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import {
  getPriceHistory,
  getOptionMarkHistory,
  getEarliestTransactionDate,
} from "@/server/queries/market-data";
import { getUniquePortfolios } from "@/server/queries/portfolios";
import {
  computeAggregates,
  computePositions,
  computeXIRR,
  mergePositionsByTicker,
} from "@/server/services/computation";
import {
  computeDailyHoldings,
  computeTwrrFromHoldings,
  type DailyHoldingsPoint,
  type HoldingsTwrrPoint,
} from "@/server/services/daily-holdings";
import { buildEpisodes } from "@/server/services/episodes";
import { detectTransferPairs, type TransferPair } from "@/server/services/transfer-detection";
import { computeAttribution, type AttributionResult } from "@/server/services/attribution";
import {
  computeFrozenBook,
  computeDepositsOnlyBenchmark,
  type FrozenBookResult,
  type SyntheticResult,
} from "@/server/services/counterfactual";
import {
  computeHoldingPeriodStats,
  computeWinLossStats,
  computeAveragingBehavior,
  computeTurnover,
  computeOutOfMarketEpisodes,
  type HoldingPeriodStats,
  type WinLossStats,
  type AveragingStats,
  type TurnoverYear,
  type OutOfMarketEpisode,
} from "@/server/services/trade-analytics";
import { findUnmappedTickers, sleeveOf } from "@/server/services/sleeve-map";
import { getSectorByTickerMap } from "@/server/queries/ticker-fundamentals";
import { getCurrentlyHeldTickers } from "@/server/queries/market-data";
import {
  computeDrawdowns,
  computeRiskStats,
  computeRobustRiskStats,
  computeBenchmarkRelation,
  computeRegimeSlices,
  rollingVolatility,
  findAnomalousDays,
  type DrawdownAnalysis,
  type RiskStats,
  type BenchmarkRelation,
  type RegimeRiskSlice,
  type AnomalousDay,
  type GrowthPoint,
} from "@/server/services/risk-metrics";
import {
  buildReturnsForWindow,
  computeCorrelationMatrix,
  computeConcentrationStats,
  DEFAULT_CORRELATION_WINDOW_DAYS,
  type CorrelationMatrix,
  type ConcentrationStats,
} from "@/server/services/correlation";
import {
  computeEntryTiming,
  computeExitTiming,
  type EntryTimingResult,
  type ExitTimingResult,
} from "@/server/services/timing-analytics";
import {
  computeDailyContribution,
  type ContributionResult,
} from "@/server/services/attribution";
import {
  computeSyntheticPortfolio,
  type SyntheticResult as SyntheticPortfolioResult,
} from "@/server/services/counterfactual";
import {
  computeTradeClustering,
  type TradeClusteringResult,
} from "@/server/services/trade-analytics";
import type { PositionEpisode, EpisodeAnomaly } from "@/server/types/analytics";
import type { MarketDataInput, TransactionInput } from "@/server/types/positions";

const BENCHMARKS = ["SPY", "QQQ", "VTI"] as const;
const PIVOT_DATE = "2025-01-01";

export interface PeriodPerformanceRow {
  label: string;
  from: string;
  to: string;
  portfolioReturnPct: number | null;
  portfolioAnnualizedPct: number | null;
  benchmarkReturnPct: Record<string, number | null>;
  excessVsSpyPct: number | null;
  avgNavUsd: number;
  endNavUsd: number;
  netInvestedUsd: number;
}

export interface ScopePerformance {
  scope: string;
  inception: string;
  xirrPct: number | null;
  rows: PeriodPerformanceRow[];
}

export interface AnalyticsCaveat {
  id: string;
  severity: "critical" | "high" | "medium";
  affects: string[];
  text: string;
}

export interface BehaviorAnalyticsReport {
  meta: {
    generatedAt: string;
    scope: string;
    inception: string;
    ledgerAsOf: string;
    priceAsOf: string;
    valuationAsOf: string;
    portfolios: string[];
    counts: Record<string, number>;
  };
  caveats: AnalyticsCaveat[];
  dataQuality: {
    offCalendarRows: { total: number; trades: number; tradeNotionalUsd: number; dates: string[] };
    feeRowsWithZeroFeeColumn: number;
    unmappedTickers: string[];
    episodeAnomalies: EpisodeAnomaly[];
    thinCoverage: { ticker: string; rows: number; firstDate: string; lastDate: string }[];
    optionMarkCount: number;
    maxStaleValueShare: { date: string; sharePct: number } | null;
  };
  transfers: {
    policy: "exclude";
    pairs: TransferPair[];
    totalSellUsd: number;
    totalBuyUsd: number;
  };
  performance: ScopePerformance[];
  episodes: {
    grain: "consolidated";
    closed: PositionEpisode[];
    open: PositionEpisode[];
    accountGrainCount: number;
  };
  behavior: {
    holdingPeriod: HoldingPeriodStats;
    winLoss: WinLossStats;
    winLossBySleeve: { sleeve: string; stats: WinLossStats }[];
    averaging: AveragingStats;
    turnover: TurnoverYear[];
    outOfMarket: { scope: string; episodes: OutOfMarketEpisode[] }[];
  };
  attribution: {
    itdBySleeve: AttributionResult;
    itdByTicker: AttributionResult;
    pre2025BySleeve: AttributionResult;
    post2025BySleeve: AttributionResult;
    itdBySector: AttributionResult;
    contributionBySleeve: ContributionResult;
    contributionByTicker: ContributionResult;
  };
  risk: {
    headline: RiskStats;
    robust: RiskStats;
    drawdowns: DrawdownAnalysis;
    benchmarkDrawdowns: { symbol: string; analysis: DrawdownAnalysis }[];
    benchmarkRelations: BenchmarkRelation[];
    benchmarkStats: { symbol: string; stats: RiskStats }[];
    rollingVol90: { date: string; value: number }[];
    anomalousDays: AnomalousDay[];
    regimes: RegimeRiskSlice[];
  };
  concentration: {
    matrix: CorrelationMatrix;
    stats: ConcentrationStats;
    windowDays: number;
  };
  timing: {
    entry: EntryTimingResult;
    exit: ExitTimingResult;
    clustering: TradeClusteringResult;
  };
  counterfactual: {
    frozenBooks: FrozenBookResult[];
    primaryFreezeDate: string;
    depositsOnly: SyntheticResult[];
    alternativeSchedules: SyntheticPortfolioResult[];
    actualPostPivotReturnPct: number | null;
  };
  series: {
    portfolioTwrr: HoldingsTwrrPoint[];
    benchmarkGrowth: Record<string, { date: string; growthOfDollar: number }[]>;
    dailyHoldings?: DailyHoldingsPoint[];
  };
}

export interface BehaviorAnalyticsOptions {
  portfolio?: string;
  freezeDates?: string[];
  includeDailyHoldings?: boolean;
  includeTradeDetail?: boolean;
  /** Annual risk-free rate in percent. Default 0 — see the caveat. */
  riskFreeAnnualPct?: number;
  correlationWindowDays?: number;
}

export function getBehaviorAnalytics(
  options: BehaviorAnalyticsOptions = {}
): BehaviorAnalyticsReport {
  const {
    portfolio,
    includeDailyHoldings = false,
    includeTradeDetail = true,
    riskFreeAnnualPct = 0,
    correlationWindowDays = DEFAULT_CORRELATION_WINDOW_DAYS,
  } = options;

  const { txInputs } = fetchPositionInputs(portfolio);
  const { txInputs: allTxInputs } = fetchPositionInputs();
  if (txInputs.length === 0) throw new Error("No transactions in scope.");

  const tickers = [...new Set(allTxInputs.map((t) => t.ticker))];
  const priceHistory = getPriceHistory(
    [...new Set([...tickers, ...BENCHMARKS])],
    "stock_price",
    "1900-01-01"
  );
  const optionMarkHistory = getOptionMarkHistory();

  const spyHistory = priceHistory["SPY"] ?? [];
  const calendar = spyHistory.map((p) => p.date);
  const priceAsOf = calendar[calendar.length - 1] ?? "";
  const markDates = Object.values(optionMarkHistory)
    .flat()
    .map((m) => m.date)
    .sort();
  const lastMark = markDates[markDates.length - 1] ?? priceAsOf;

  // Valuation runs to the freshest datum available, which is what the app
  // itself does. The trading calendar is extended by that one day so the
  // terminal snapshot ties to the dashboard rather than lagging it.
  const valuationAsOf = lastMark > priceAsOf ? lastMark : priceAsOf;
  const extendedCalendar =
    valuationAsOf > priceAsOf ? [...calendar, valuationAsOf] : calendar;

  const ledgerAsOf = allTxInputs.reduce((max, t) => (t.date > max ? t.date : max), "");
  const inception = txInputs.reduce((min, t) => (t.date < min ? t.date : min), txInputs[0].date);

  const transfers = detectTransferPairs(allTxInputs);

  const points = computeDailyHoldings({
    transactions: txInputs,
    priceHistory,
    fxHistory: [],
    optionMarkHistory,
    tradingCalendar: extendedCalendar,
    endDate: valuationAsOf,
  });

  const consolidated = buildEpisodes(txInputs, {
    grain: "consolidated",
    endDate: valuationAsOf,
    priceHistory,
    optionMarkHistory,
    fxRates: [],
    transferLegTxIds: transfers.legTxIds,
    transferMatchedQtyByTxId: transfers.matchedQtyByTxId,
    sleeveOf,
  });
  const accountGrain = buildEpisodes(txInputs, {
    grain: "account",
    endDate: valuationAsOf,
    priceHistory,
    optionMarkHistory,
    fxRates: [],
    sleeveOf,
  });

  const closedEpisodes = consolidated.episodes.filter((e) => !e.isOpen);
  const openEpisodes = consolidated.episodes.filter((e) => e.isOpen);

  // ---- Performance, per scope ----
  const portfolios = getUniquePortfolios();
  const scopes: { name: string; txs: TransactionInput[] }[] = [
    { name: "Combined", txs: txInputs },
  ];
  if (portfolio === undefined) {
    for (const p of portfolios) {
      scopes.push({ name: p, txs: allTxInputs.filter((t) => t.portfolio === p) });
    }
  }

  const performance = scopes.map((s) =>
    buildScopePerformance(
      s.name,
      s.txs,
      priceHistory,
      optionMarkHistory,
      extendedCalendar,
      valuationAsOf
    )
  );

  const portfolioTwrr = computeTwrrFromHoldings(points);

  const benchmarkGrowth: Record<string, { date: string; growthOfDollar: number }[]> = {};
  for (const symbol of BENCHMARKS) {
    benchmarkGrowth[symbol] = growthSeries(priceHistory[symbol] ?? [], extendedCalendar, inception);
  }

  // ---- Counterfactuals ----
  const freezeDates =
    options.freezeDates ??
    ["2021-12-31", "2022-12-31", "2023-12-31", "2024-12-31", "2025-12-31"].filter(
      (d) => d > inception && d < valuationAsOf
    );

  const frozenBooks = freezeDates.map((freezeDate) =>
    computeFrozenBook(points, {
      freezeDate,
      asOf: valuationAsOf,
      tradingCalendar: extendedCalendar,
      priceHistory,
      transactions: txInputs,
    })
  );

  const depositsOnly = BENCHMARKS.map((symbol) =>
    computeDepositsOnlyBenchmark(points, {
      symbol,
      priceSeries: priceHistory[symbol] ?? [],
      tradingCalendar: extendedCalendar,
      startDate: inception,
      endDate: valuationAsOf,
    })
  );

  const alternativeSchedules: SyntheticPortfolioResult[] = [
    ...(["raw-daily", "monthly-netted"] as const).map((schedule) =>
      computeSyntheticPortfolio(points, {
        label: `SPY (${schedule})`,
        legs: [{ symbol: "SPY", weight: 1 }],
        schedule,
        priceHistory,
        tradingCalendar: extendedCalendar,
        startDate: inception,
        endDate: valuationAsOf,
      })
    ),
    // A price-only 60/40 would be wrong by double digits — BND's price return
    // is roughly -16% ITD against a flat total return — so the bond leg carries
    // an explicit assumed yield and every figure is flagged MODELLED.
    computeSyntheticPortfolio(points, {
      label: "60/40 VTI/BND (MODELLED)",
      legs: [
        { symbol: "VTI", weight: 0.6 },
        { symbol: "BND", weight: 0.4, modeledYieldPct: 3.8 },
      ],
      schedule: "deposits-only",
      priceHistory,
      tradingCalendar: extendedCalendar,
      startDate: inception,
      endDate: valuationAsOf,
      rebalance: "annual",
    }),
  ];

  const combined = performance[0];
  const postPivot = combined.rows.find((r) => r.label === "Post-pivot (2025+)");

  // ---- Risk ----
  const portfolioGrowth: GrowthPoint[] = portfolioTwrr.map((p) => ({
    date: p.date,
    growthOfDollar: p.growthOfDollar,
    marketValueUsd: p.marketValueUsd,
  }));
  const benchmarkGrowthPoints: Record<string, GrowthPoint[]> = {};
  for (const symbol of BENCHMARKS) {
    benchmarkGrowthPoints[symbol] = benchmarkGrowth[symbol].map((p) => ({
      date: p.date,
      growthOfDollar: p.growthOfDollar,
    }));
  }

  const risk: BehaviorAnalyticsReport["risk"] = {
    headline: computeRiskStats(portfolioGrowth, riskFreeAnnualPct),
    robust: computeRobustRiskStats(portfolioGrowth, riskFreeAnnualPct),
    drawdowns: computeDrawdowns(portfolioGrowth),
    benchmarkDrawdowns: BENCHMARKS.map((symbol) => ({
      symbol,
      analysis: computeDrawdowns(benchmarkGrowthPoints[symbol]),
    })),
    benchmarkRelations: BENCHMARKS.map((symbol) =>
      computeBenchmarkRelation(symbol, portfolioGrowth, benchmarkGrowthPoints[symbol])
    ),
    benchmarkStats: BENCHMARKS.map((symbol) => ({
      symbol,
      stats: computeRiskStats(benchmarkGrowthPoints[symbol], riskFreeAnnualPct),
    })),
    rollingVol90: rollingVolatility(portfolioGrowth, 90),
    anomalousDays: findAnomalousDays(portfolioGrowth),
    regimes: computeRegimeSlices(
      [
        { label: "Pre-2025", from: inception, to: "2024-12-31" },
        { label: "2025 onward", from: PIVOT_DATE, to: valuationAsOf },
        // The book only became concentrated single-stock after the relocation.
        { label: "Post-relocation", from: "2025-12-10", to: valuationAsOf },
      ],
      portfolioGrowth,
      benchmarkGrowthPoints,
      riskFreeAnnualPct
    ),
  };

  // ---- Concentration ----
  const heldStockTickers = getCurrentlyHeldTickers().filter((t) =>
    txInputs.some((x) => x.ticker === t)
  );
  const corrFrom = extendedCalendar[
    Math.max(0, extendedCalendar.length - correlationWindowDays)
  ];
  const returnsByTicker = buildReturnsForWindow(
    priceHistory,
    heldStockTickers,
    extendedCalendar,
    corrFrom,
    valuationAsOf
  );
  const matrix = computeCorrelationMatrix(returnsByTicker);

  const aggregate = computeAggregates(
    mergePositionsByTicker(
      computePositions(
        txInputs,
        latestPriceMap(priceHistory),
        [],
        valuationAsOf,
        latestMarkMap(optionMarkHistory)
      ),
      txInputs,
      [],
      valuationAsOf
    )
  );
  const weights = aggregate.positions
    .filter((p) => p.instrument === "stock" && (p.weight ?? 0) > 0)
    .map((p) => ({ ticker: p.ticker, weightPct: p.weight ?? 0 }));

  // ---- Timing ----
  const closingTxIds = new Set<number>();
  for (const e of consolidated.episodes) {
    if (e.isOpen) continue;
    const last = e.trades[e.trades.length - 1];
    if (last?.action === "sell") closingTxIds.add(last.txId);
  }

  const timing: BehaviorAnalyticsReport["timing"] = {
    entry: computeEntryTiming(txInputs, {
      priceHistory,
      benchmarkSeries: spyHistory,
      episodes: consolidated.episodes,
      excludeTxIds: transfers.legTxIds,
    }),
    exit: computeExitTiming(txInputs, {
      priceHistory,
      benchmarkSeries: spyHistory,
      excludeTxIds: transfers.legTxIds,
      closingTxIds,
    }),
    clustering: computeTradeClustering(txInputs, {
      portfolioSeries: portfolioGrowth,
      benchmarkSeries: spyHistory,
      excludeTxIds: transfers.legTxIds,
    }),
  };

  const sectorByTicker = getSectorByTickerMap();

  // ---- Behaviour ----
  const sleeves = [...new Set(closedEpisodes.map((e) => e.sleeve ?? "Unassigned"))].sort();
  const winLossBySleeve = sleeves.map((sleeve) => ({
    sleeve,
    stats: computeWinLossStats(closedEpisodes.filter((e) => (e.sleeve ?? "Unassigned") === sleeve)),
  }));

  const outOfMarket = scopes.map((s) => {
    const scopePoints =
      s.name === "Combined"
        ? points
        : computeDailyHoldings({
            transactions: s.txs,
            priceHistory,
            fxHistory: [],
            optionMarkHistory,
            tradingCalendar: extendedCalendar,
            endDate: valuationAsOf,
            includeHoldings: false,
          });
    return {
      scope: s.name,
      episodes: computeOutOfMarketEpisodes(scopePoints, {
        minCapitalUsd: 5000,
        benchmarkSeries: spyHistory,
      }),
    };
  });

  const report: BehaviorAnalyticsReport = {
    meta: {
      generatedAt: new Date().toISOString(),
      scope: portfolio ?? "Combined",
      inception,
      ledgerAsOf,
      priceAsOf,
      valuationAsOf,
      portfolios,
      counts: {
        transactions: txInputs.length,
        tickers: new Set(txInputs.map((t) => t.ticker)).size,
        consolidatedEpisodes: consolidated.episodes.length,
        closedEpisodes: closedEpisodes.length,
        openEpisodes: openEpisodes.length,
        accountEpisodes: accountGrain.episodes.length,
        transferPairs: transfers.pairs.length,
      },
    },
    caveats: buildCaveats(riskFreeAnnualPct),
    dataQuality: buildDataQuality(
      allTxInputs,
      calendar,
      priceHistory,
      optionMarkHistory,
      consolidated.anomalies,
      points,
      tickers
    ),
    transfers: {
      policy: "exclude",
      pairs: transfers.pairs,
      totalSellUsd: transfers.totalSellUsd,
      totalBuyUsd: transfers.totalBuyUsd,
    },
    performance,
    episodes: {
      grain: "consolidated",
      closed: includeTradeDetail
        ? closedEpisodes
        : closedEpisodes.map((e) => ({ ...e, trades: [] })),
      open: includeTradeDetail ? openEpisodes : openEpisodes.map((e) => ({ ...e, trades: [] })),
      accountGrainCount: accountGrain.episodes.length,
    },
    behavior: {
      holdingPeriod: computeHoldingPeriodStats(consolidated.episodes),
      winLoss: computeWinLossStats(closedEpisodes),
      winLossBySleeve,
      averaging: computeAveragingBehavior(closedEpisodes),
      turnover: computeTurnover(txInputs, points, {
        transferMatchedQtyByTxId: transfers.matchedQtyByTxId,
        asOf: valuationAsOf,
      }),
      outOfMarket,
    },
    attribution: {
      itdBySleeve: computeAttribution(points, { groupBy: "sleeve" }),
      itdByTicker: computeAttribution(points, { groupBy: "ticker" }),
      pre2025BySleeve: computeAttribution(points, { groupBy: "sleeve", to: "2024-12-31" }),
      post2025BySleeve: computeAttribution(points, { groupBy: "sleeve", from: PIVOT_DATE }),
      itdBySector: computeAttribution(points, { groupBy: "sector", sectorByTicker }),
      contributionBySleeve: computeDailyContribution(points, { groupBy: "sleeve" }),
      contributionByTicker: computeDailyContribution(points, { groupBy: "ticker" }),
    },
    risk,
    concentration: {
      matrix,
      stats: computeConcentrationStats(weights, matrix, returnsByTicker),
      windowDays: correlationWindowDays,
    },
    timing,
    counterfactual: {
      frozenBooks,
      primaryFreezeDate: "2024-12-31",
      depositsOnly,
      alternativeSchedules,
      actualPostPivotReturnPct: postPivot?.portfolioReturnPct ?? null,
    },
    series: {
      portfolioTwrr,
      benchmarkGrowth,
      ...(includeDailyHoldings ? { dailyHoldings: points } : {}),
    },
  };

  return report;
}

function buildScopePerformance(
  scope: string,
  txs: TransactionInput[],
  priceHistory: Record<string, MarketDataInput[]>,
  optionMarkHistory: Record<string, MarketDataInput[]>,
  calendar: string[],
  asOf: string
): ScopePerformance {
  const inception = txs.reduce((min, t) => (t.date < min ? t.date : min), txs[0].date);

  // Only totals are read here, so the per-holding arrays are skipped.
  const points = computeDailyHoldings({
    transactions: txs,
    priceHistory,
    fxHistory: [],
    optionMarkHistory,
    tradingCalendar: calendar,
    endDate: asOf,
    includeHoldings: false,
  });
  const twrr = computeTwrrFromHoldings(points).filter((p) => p.date >= inception);

  const benchmarks: Record<string, { date: string; growthOfDollar: number }[]> = {};
  for (const symbol of BENCHMARKS) {
    benchmarks[symbol] = growthSeries(priceHistory[symbol] ?? [], calendar, inception);
  }

  const navByDate = new Map(points.map((p) => [p.date, p.totalMarketValueUsd]));
  const flowByDate = new Map(points.map((p) => [p.date, p.totalExternalFlowUsd]));

  const startYear = Number(inception.slice(0, 4));
  const endYear = Number(asOf.slice(0, 4));
  const windows: { label: string; from: string; to: string }[] = [
    { label: "Inception to date", from: inception, to: asOf },
  ];
  for (let y = startYear; y <= endYear; y += 1) {
    windows.push({
      label: y === endYear ? `CY${y} (partial)` : `CY${y}`,
      from: `${y}-01-01`,
      to: `${y}-12-31`,
    });
  }
  windows.push({ label: "Pre-pivot (to 2024)", from: inception, to: "2024-12-31" });
  windows.push({ label: "Post-pivot (2025+)", from: PIVOT_DATE, to: asOf });

  const rows: PeriodPerformanceRow[] = [];
  for (const w of windows) {
    if (w.to < inception) continue;
    const from = w.from < inception ? inception : w.from;
    const to = w.to > asOf ? asOf : w.to;

    const portfolioReturnPct = windowReturn(twrr, from, to);
    const benchmarkReturnPct: Record<string, number | null> = {};
    for (const symbol of BENCHMARKS) {
      benchmarkReturnPct[symbol] = windowReturn(benchmarks[symbol], from, to);
    }

    const inWindow = points.filter((p) => p.date >= from && p.date <= to);
    const avgNav =
      inWindow.length === 0
        ? 0
        : inWindow.reduce((a, p) => a + p.totalMarketValueUsd, 0) / inWindow.length;
    const endNav = navByDate.get(inWindow[inWindow.length - 1]?.date ?? "") ?? 0;
    const netInvested = inWindow.reduce(
      (a, p) => a + (flowByDate.get(p.date) ?? 0),
      0
    );

    const spy = benchmarkReturnPct["SPY"];
    rows.push({
      label: w.label,
      from,
      to: inWindow[inWindow.length - 1]?.date ?? to,
      portfolioReturnPct,
      portfolioAnnualizedPct: annualizeReturn(portfolioReturnPct, from, to),
      benchmarkReturnPct,
      excessVsSpyPct:
        portfolioReturnPct === null || spy === null || spy === undefined
          ? null
          : portfolioReturnPct - spy,
      avgNavUsd: avgNav,
      endNavUsd: endNav,
      netInvestedUsd: netInvested,
    });
  }

  const positions = computePositions(
    txs,
    latestPriceMap(priceHistory),
    [],
    asOf,
    latestMarkMap(optionMarkHistory)
  );
  const flows = buildScopeFlows(txs);
  const terminal = positions.reduce((a, p) => a + (p.marketValue ?? 0), 0);
  if (terminal > 0) flows.push({ date: asOf, amount: terminal });

  return { scope, inception, xirrPct: computeXIRR(flows), rows };
}

function buildScopeFlows(txs: TransactionInput[]): { date: string; amount: number }[] {
  const flows: { date: string; amount: number }[] = [];
  for (const t of txs) {
    switch (t.action) {
      case "buy":
        flows.push({ date: t.date, amount: -(t.grossAmount + t.fees) });
        break;
      case "sell":
        flows.push({ date: t.date, amount: t.grossAmount - t.fees });
        break;
      case "dividend":
        flows.push({ date: t.date, amount: t.grossAmount });
        break;
      case "fee":
        flows.push({ date: t.date, amount: -t.fees });
        break;
    }
  }
  return flows;
}

function latestPriceMap(
  priceHistory: Record<string, MarketDataInput[]>
): Record<string, MarketDataInput> {
  const out: Record<string, MarketDataInput> = {};
  for (const [symbol, rows] of Object.entries(priceHistory)) {
    if (rows.length === 0) continue;
    const last = rows.reduce((a, b) => (b.date > a.date ? b : a));
    out[symbol] = last;
  }
  return out;
}

function latestMarkMap(
  optionMarkHistory: Record<string, MarketDataInput[]>
): Record<string, { value: number; date: string }> {
  const out: Record<string, { value: number; date: string }> = {};
  for (const [ticker, rows] of Object.entries(optionMarkHistory)) {
    if (rows.length === 0) continue;
    const last = rows.reduce((a, b) => (b.date > a.date ? b : a));
    out[ticker] = { value: last.value, date: last.date };
  }
  return out;
}

function growthSeries(
  prices: MarketDataInput[],
  calendar: string[],
  from: string
): { date: string; growthOfDollar: number }[] {
  const sorted = [...prices].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length === 0) return [];
  const dates = calendar.filter((d) => d >= from);
  const out: { date: string; growthOfDollar: number }[] = [];
  let base: number | null = null;
  for (const date of dates) {
    const price = lastValueAtOrBefore(sorted, date);
    if (price === null) continue;
    if (base === null) base = price;
    out.push({ date, growthOfDollar: base === 0 ? 1 : price / base });
  }
  return out;
}

function lastValueAtOrBefore(sorted: MarketDataInput[], date: string): number | null {
  let lo = 0;
  let hi = sorted.length - 1;
  let best = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].date <= date) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best === -1 ? null : sorted[best].value;
}

/**
 * Re-anchors a chain-linked growth series to `[from, to]`. The anchor is the
 * last observation strictly before `from`, so the window excludes any move that
 * happened before it opened.
 */
function windowReturn(
  series: { date: string; growthOfDollar: number }[],
  from: string,
  to: string
): number | null {
  const inWindow = series.filter((p) => p.date >= from && p.date <= to);
  if (inWindow.length === 0) return null;
  const before = series.filter((p) => p.date < from);
  const anchor =
    before.length > 0 ? before[before.length - 1].growthOfDollar : inWindow[0].growthOfDollar;
  if (anchor === 0) return null;
  const end = inWindow[inWindow.length - 1].growthOfDollar;
  return (end / anchor - 1) * 100;
}

function annualizeReturn(returnPct: number | null, from: string, to: string): number | null {
  if (returnPct === null) return null;
  const growth = 1 + returnPct / 100;
  if (growth <= 0) return null;
  const days = differenceInDays(parseISO(to), parseISO(from));
  if (days < 365) return null;
  return (Math.pow(growth, 365.25 / days) - 1) * 100;
}

function buildDataQuality(
  allTxInputs: TransactionInput[],
  calendar: string[],
  priceHistory: Record<string, MarketDataInput[]>,
  optionMarkHistory: Record<string, MarketDataInput[]>,
  anomalies: EpisodeAnomaly[],
  points: DailyHoldingsPoint[],
  tickers: string[]
): BehaviorAnalyticsReport["dataQuality"] {
  const calendarSet = new Set(calendar);
  const offCalendar = allTxInputs.filter((t) => !calendarSet.has(t.date));
  const offTrades = offCalendar.filter((t) => t.action === "buy" || t.action === "sell");

  const thinCoverage = tickers
    .map((ticker) => {
      const rows = priceHistory[ticker] ?? [];
      return {
        ticker,
        rows: rows.length,
        firstDate: rows[0]?.date ?? "",
        lastDate: rows[rows.length - 1]?.date ?? "",
      };
    })
    .filter((c) => c.rows > 0 && c.rows < 252)
    .sort((a, b) => a.rows - b.rows);

  const worstStale = points.reduce<DailyHoldingsPoint | null>(
    (a, p) => (a === null || p.staleValueShare > a.staleValueShare ? p : a),
    null
  );

  return {
    offCalendarRows: {
      total: offCalendar.length,
      trades: offTrades.length,
      tradeNotionalUsd: offTrades.reduce((a, t) => a + t.grossAmount, 0),
      dates: [...new Set(offCalendar.map((t) => t.date))].sort(),
    },
    feeRowsWithZeroFeeColumn: allTxInputs.filter(
      (t) => t.action === "fee" && t.fees === 0
    ).length,
    unmappedTickers: findUnmappedTickers(
      allTxInputs.filter((t) => t.instrument === "stock").map((t) => t.ticker)
    ),
    episodeAnomalies: anomalies,
    thinCoverage,
    optionMarkCount: Object.values(optionMarkHistory).reduce((a, r) => a + r.length, 0),
    maxStaleValueShare:
      worstStale && worstStale.staleValueShare > 0
        ? { date: worstStale.date, sharePct: worstStale.staleValueShare * 100 }
        : null,
  };
}

function buildCaveats(riskFreeAnnualPct: number): AnalyticsCaveat[] {
  return [
    {
      id: "risk-free-assumption",
      severity: "medium",
      affects: ["risk"],
      text:
        `Sharpe, Sortino and Calmar are computed as excess over ${riskFreeAnnualPct}% cash. ` +
        "The database holds no interest-rate data and the window spans roughly 0% to 5%+ " +
        "policy rates, so any single constant is wrong for most of it. Re-run with --rf to " +
        "test a different assumption.",
    },
    {
      id: "options-excluded-from-risk",
      severity: "medium",
      affects: ["risk", "concentration"],
      text:
        "Option positions are carried at cost between marks, so their daily path is a step " +
        "function. They are excluded from the correlation matrix and contribute a fake-smooth " +
        "series to portfolio volatility. Treat option P&L as a total, never as a time series.",
    },
    {
      id: "incomplete-forward-windows",
      severity: "medium",
      affects: ["timing.exit"],
      text:
        "Exit-regret horizons that extend past the last available price are EXCLUDED from the " +
        "aggregates, not truncated to the return so far. Truncating would bias long horizons " +
        "toward recent trades. The count excluded is printed beside each horizon.",
    },
    {
      id: "entry-cohort-confound",
      severity: "high",
      affects: ["timing.entry"],
      text:
        "The entry-cohort win rates are NOT independent observations. Each buy inherits the " +
        "outcome of the whole episode it belongs to, so an episode with ten buys contributes " +
        "ten rows — and positions that are working tend to get added to more often. That " +
        "mechanically inflates the win rate of whichever cohort contains the most adds. Read " +
        "the cohorts as descriptive, not as evidence that one entry style outperforms.",
    },
    {
      id: "moving-average-coverage",
      severity: "medium",
      affects: ["timing.entry"],
      text:
        "A 200-day average needs 200 prior observations. Recent listings and the earliest " +
        "purchases have none, so those buys are absent from the moving-average statistics. " +
        "Coverage counts are reported rather than the subset being left implicit.",
    },
    {
      id: "untracked-cash",
      severity: "critical",
      affects: ["performance", "counterfactual"],
      text:
        "The database has no cash account, so every return here measures the invested sleeve only. Capital sitting idle is invisible: the Aug-Nov 2025 risk-off and the ~$49k Wio AED balance never appear. The frozen-book counterfactual has no equivalent exclusion, so this asymmetry flatters the actual portfolio.",
    },
    {
      id: "price-return-not-total-return",
      severity: "critical",
      affects: ["performance", "counterfactual"],
      text:
        "All series are price-return. Dividend cash leaves the model entirely and FMP prices are split- but not dividend-adjusted. The pre-2025 book was heavily bond and income funds whose return is mostly income, so the pre-2025 vs post-2025 comparison is structurally biased in favour of post-2025. Read the dividends-to-AUM table alongside it.",
    },
    {
      id: "broker-relocation",
      severity: "high",
      affects: ["behavior.turnover", "episodes"],
      text:
        "The Dec-2025 cross-broker move is not investing. It is detected, published in full, and netted out of turnover by matched notional. Consolidated-grain episodes make it invisible for names that stayed net-long across the move.",
    },
    {
      id: "right-censoring",
      severity: "high",
      affects: ["behavior.holdingPeriod"],
      text:
        "Closed episodes only. Long-running winners are disproportionately still open and therefore excluded, which is the exact direction that manufactures a disposition effect. Open-episode ages are reported separately.",
    },
    {
      id: "weighted-average-cost",
      severity: "high",
      affects: ["episodes"],
      text:
        "No lot tracking exists, so episode return percentages are cash-on-cash on gross capital deployed and are not comparable across episodes with different trade counts. Rank by dollars, not by percent.",
    },
    {
      id: "sample-size",
      severity: "medium",
      affects: ["behavior"],
      text:
        "The closed-episode sample is small once split by outcome. Treat any win rate or significance test as indicative; n is printed beside every ratio.",
    },
    {
      id: "options-barely-observable",
      severity: "high",
      affects: ["attribution", "episodes"],
      text:
        "Option positions are carried at cost for most of their life because the ledger holds only a handful of marks. Their P&L is therefore recognised almost entirely on the trade date, making the daily series a spike train. Totals are sound; time-distribution is not.",
    },
    {
      id: "off-calendar-defect",
      severity: "high",
      affects: ["performance", "dataQuality"],
      text:
        "The app's own chart engine consumes transactions by trading-calendar date and silently drops rows dated on non-trading days, so those positions never close. This report uses a corrected walk that ties to computePositions exactly, and its performance figures will therefore differ from the app's Performance panel.",
    },
    {
      id: "ledger-only-basis",
      severity: "medium",
      affects: ["all"],
      text:
        "Ledger-only. The ~$49k Wio AED cash and untracked VWRA/EVR positions are outside the database and excluded from every figure.",
    },
    {
      id: "per-portfolio-not-comparable",
      severity: "medium",
      affects: ["performance"],
      text:
        "In a single-portfolio scope the cross-broker relocation reads as genuine full exits. The combined scope is canonical.",
    },
  ];
}

export function getEarliestLedgerDate(): string | null {
  return getEarliestTransactionDate();
}

/**
 * Cached entry point for the /analytics page.
 *
 * The full run costs roughly two seconds, and a page renders several panels
 * that each need the same result. React's `cache` dedupes them within a single
 * request — but only when the arguments are primitives, since it compares by
 * reference. Hence the flat parameter list rather than an options object.
 */
export const getAnalyticsForPage = cache(
  (portfolio?: string, riskFreeAnnualPct = 0): BehaviorAnalyticsReport =>
    getBehaviorAnalytics({
      portfolio,
      riskFreeAnnualPct,
      // The page never renders per-trade detail; skipping it avoids serialising
      // several thousand nested objects into the RSC payload.
      includeTradeDetail: false,
    })
);
