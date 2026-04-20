import { format } from "date-fns";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import {
  getPriceHistory,
  getEarliestTransactionDate,
} from "@/server/queries/market-data";
import {
  computePortfolioTWRR,
  computeBenchmarkSeries,
  sliceAndReanchor,
} from "@/server/services/twrr";
import { BENCHMARK_TICKERS } from "@/server/services/fmp";
import { resolvePeriodStart } from "@/lib/period";
import type { TwrrSeries } from "@/server/services/twrr";
import type { FxRateInput } from "@/server/types/positions";
import type { Period } from "@/shared/schemas/period";

export interface PerformanceChartPoint {
  date: string;
  portfolio: number | null;
  spy: number | null;
  qqq: number | null;
}

export interface PerformanceData {
  portfolio: TwrrSeries;
  spy: TwrrSeries;
  qqq: TwrrSeries;
  /** Aligned series for the chart (one row per trading day). */
  chartSeries: PerformanceChartPoint[];
  /** True when SPY/QQQ history is populated enough to draw the comparison. */
  hasBenchmarkData: boolean;
  /** True when the user has any transactions at all. */
  hasTransactions: boolean;
}

const EMPTY: PerformanceData = {
  portfolio: emptySeries(),
  spy: emptySeries(),
  qqq: emptySeries(),
  chartSeries: [],
  hasBenchmarkData: false,
  hasTransactions: false,
};

function emptySeries(): TwrrSeries {
  return {
    series: [],
    cumulativeReturnPct: null,
    annualizedReturnPct: null,
    startDate: null,
    endDate: null,
  };
}

export function getPerformanceData(
  portfolio?: string,
  period: Period = "ITD",
): PerformanceData {
  const earliest = getEarliestTransactionDate();
  if (earliest === null) return EMPTY;

  const { txInputs } = fetchPositionInputs(portfolio);
  if (txInputs.length === 0) {
    return { ...EMPTY, hasTransactions: false };
  }

  // Earliest scoped to the filtered transaction set so per-portfolio TWRR
  // anchors at the right date. Benchmark series use the same anchor for
  // an apples-to-apples chart.
  const startDate = txInputs.reduce(
    (min, t) => (t.date < min ? t.date : min),
    txInputs[0].date
  );
  const now = new Date();
  const endDate = format(now, "yyyy-MM-dd");
  const periodStart = resolvePeriodStart(period, now, startDate);

  const heldTickers = [...new Set(txInputs.map((t) => t.ticker))];
  const fxCurrencies = [
    ...new Set(txInputs.map((t) => t.currency)),
  ].filter((c) => c !== "USD");

  const allPriceSymbols = [...new Set([...heldTickers, ...BENCHMARK_TICKERS])];
  const priceHistory = getPriceHistory(allPriceSymbols, "stock_price", startDate);

  // Trading calendar: union of SPY's price dates within the window. If SPY is
  // missing (backfill not yet run), fall back to the union of every held
  // ticker's price dates so the portfolio series can still render.
  const spyHistory = priceHistory["SPY"] ?? [];
  const qqqHistory = priceHistory["QQQ"] ?? [];
  const hasBenchmarkData = spyHistory.length > 1 && qqqHistory.length > 1;

  const tradingCalendar = hasBenchmarkData
    ? spyHistory.map((p) => p.date)
    : buildFallbackCalendar(priceHistory, heldTickers);

  if (tradingCalendar.length === 0) {
    return { ...EMPTY, hasTransactions: true };
  }

  const fxRows = getPriceHistory(
    fxCurrencies.map((c) => `${c}USD`),
    "fx_rate",
    startDate
  );
  const fxHistory: FxRateInput[] = Object.values(fxRows)
    .flat()
    .map((r) => ({ symbol: r.symbol, date: r.date, value: r.value }));

  const portfolioSeriesItd = computePortfolioTWRR(
    txInputs,
    priceHistory,
    fxHistory,
    tradingCalendar,
    startDate,
    endDate
  );

  const spySeriesItd = hasBenchmarkData
    ? computeBenchmarkSeries("SPY", spyHistory, tradingCalendar, startDate, endDate)
    : emptySeries();

  const qqqSeriesItd = hasBenchmarkData
    ? computeBenchmarkSeries("QQQ", qqqHistory, tradingCalendar, startDate, endDate)
    : emptySeries();

  // Re-anchor to the selected period. For ITD, periodStart === startDate and
  // the helper is an identity transform.
  const portfolioSeries = sliceAndReanchor(portfolioSeriesItd, periodStart);
  const spySeries = sliceAndReanchor(spySeriesItd, periodStart);
  const qqqSeries = sliceAndReanchor(qqqSeriesItd, periodStart);

  const chartSeries = mergeChartSeries(portfolioSeries, spySeries, qqqSeries);

  return {
    portfolio: portfolioSeries,
    spy: spySeries,
    qqq: qqqSeries,
    chartSeries,
    hasBenchmarkData,
    hasTransactions: true,
  };
}

function buildFallbackCalendar(
  priceHistory: Record<string, { date: string }[]>,
  tickers: string[]
): string[] {
  const dates = new Set<string>();
  for (const ticker of tickers) {
    const rows = priceHistory[ticker];
    if (!rows) continue;
    for (const r of rows) dates.add(r.date);
  }
  return [...dates].sort();
}

function mergeChartSeries(
  portfolio: TwrrSeries,
  spy: TwrrSeries,
  qqq: TwrrSeries
): PerformanceChartPoint[] {
  const map = new Map<string, PerformanceChartPoint>();

  for (const p of portfolio.series) {
    map.set(p.date, { date: p.date, portfolio: p.growthOfDollar, spy: null, qqq: null });
  }
  for (const p of spy.series) {
    const existing = map.get(p.date);
    if (existing) {
      existing.spy = p.growthOfDollar;
    } else {
      map.set(p.date, { date: p.date, portfolio: null, spy: p.growthOfDollar, qqq: null });
    }
  }
  for (const p of qqq.series) {
    const existing = map.get(p.date);
    if (existing) {
      existing.qqq = p.growthOfDollar;
    } else {
      map.set(p.date, { date: p.date, portfolio: null, spy: null, qqq: p.growthOfDollar });
    }
  }

  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}
