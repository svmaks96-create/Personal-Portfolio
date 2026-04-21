import { format } from "date-fns";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import {
  getPriceHistory,
  getEarliestTransactionDate,
} from "@/server/queries/market-data";
import { computeValueVsCostBasisSeries } from "@/server/services/twrr";
import { resolvePeriodStart } from "@/lib/period";
import type { ValueVsBasisPoint } from "@/server/services/twrr";
import type { FxRateInput } from "@/server/types/positions";
import type { Period } from "@/shared/schemas/period";

export interface ValueHistoryData {
  series: ValueVsBasisPoint[];
  hasTransactions: boolean;
}

const EMPTY: ValueHistoryData = { series: [], hasTransactions: false };

export function getValueHistoryData(
  portfolio?: string,
  period: Period = "1Y",
): ValueHistoryData {
  const earliest = getEarliestTransactionDate();
  if (earliest === null) return EMPTY;

  const { txInputs } = fetchPositionInputs(portfolio);
  if (txInputs.length === 0) return { ...EMPTY, hasTransactions: false };

  const startDate = txInputs.reduce(
    (min, t) => (t.date < min ? t.date : min),
    txInputs[0].date,
  );
  const now = new Date();
  const endDate = format(now, "yyyy-MM-dd");
  const periodStart = resolvePeriodStart(period, now, startDate);

  const heldTickers = [...new Set(txInputs.map((t) => t.ticker))];
  const fxCurrencies = [...new Set(txInputs.map((t) => t.currency))].filter(
    (c) => c !== "USD",
  );

  const priceHistory = getPriceHistory(heldTickers, "stock_price", startDate);

  // Prefer SPY's calendar when available (widest trading-day coverage).
  // Fall back to the union of held-ticker dates so the chart still renders
  // before the benchmark backfill has been run.
  const spyRows = getPriceHistory(["SPY"], "stock_price", startDate);
  const spyHistory = spyRows["SPY"] ?? [];
  const tradingCalendar =
    spyHistory.length > 1
      ? spyHistory.map((p) => p.date)
      : buildFallbackCalendar(priceHistory, heldTickers);

  if (tradingCalendar.length === 0) {
    return { ...EMPTY, hasTransactions: true };
  }

  const fxRows = getPriceHistory(
    fxCurrencies.map((c) => `${c}USD`),
    "fx_rate",
    startDate,
  );
  const fxHistory: FxRateInput[] = Object.values(fxRows)
    .flat()
    .map((r) => ({ symbol: r.symbol, date: r.date, value: r.value }));

  const series = computeValueVsCostBasisSeries(
    txInputs,
    priceHistory,
    fxHistory,
    tradingCalendar,
    periodStart,
    endDate,
  );

  return { series, hasTransactions: true };
}

function buildFallbackCalendar(
  priceHistory: Record<string, { date: string }[]>,
  tickers: string[],
): string[] {
  const dates = new Set<string>();
  for (const ticker of tickers) {
    const rows = priceHistory[ticker];
    if (!rows) continue;
    for (const r of rows) dates.add(r.date);
  }
  return [...dates].sort();
}
