import { computeAggregates, mergePositionsByTicker } from "@/server/services/computation";
import {
  formatCurrency,
  formatCurrencyRounded,
  formatShares,
  formatPercent,
  formatPnLRounded,
  formatIRRRounded,
  formatPriceDate,
} from "@/lib/formatting";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";

export interface ActivePositionRow {
  ticker: string;
  companyName: string | null;
  hasInvalidState: boolean;
  shares: { value: number; display: string };
  avgEntry: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  priceDate: { value: string | null; display: string; isStale: boolean };
  costBasis: { value: number | null; display: string };
  marketValue: { value: number | null; display: string };
  dividends: { value: number | null; display: string };
  sellProceeds: { value: number | null; display: string };
  pnl: { value: number | null; display: string };
  irr: { value: number | null; display: string };
  weight: { value: number | null; display: string };
}

export interface ClosedPositionRow {
  ticker: string;
  companyName: string | null;
  avgEntry: { value: number | null; display: string };
  avgExit: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  totalInvested: { value: number | null; display: string };
  totalProceeds: { value: number | null; display: string };
  dividends: { value: number | null; display: string };
  realizedPnl: { value: number | null; display: string };
  irr: { value: number | null; display: string };
}

export function getActivePositions(portfolio?: string): ActivePositionRow[] {
  const { txInputs, fxRates, today, positions, nameMap } = fetchPositionInputs(portfolio);
  // Merge all positions by ticker FIRST so that a ticker active in one portfolio
  // but closed in another resolves to a single row, then split active/closed.
  const merged = !portfolio
    ? mergePositionsByTicker(positions, txInputs, fxRates, today)
    : positions;
  const activePositions = merged.filter((p) => !p.isClosed);
  const aggregates = computeAggregates(activePositions);

  const priceDates = aggregates.positions
    .map((p) => p.lastPriceDate)
    .filter((d): d is string => d !== null);
  const maxPriceDate = priceDates.length > 0 ? priceDates.reduce((a, b) => (a > b ? a : b)) : null;

  return aggregates.positions.map((p) => ({
    ticker: p.ticker,
    companyName: nameMap[p.ticker] ?? null,
    hasInvalidState: p.hasInvalidState,
    shares: { value: p.sharesHeld, display: formatShares(p.sharesHeld) },
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    lastPrice: { value: p.lastPrice, display: formatCurrency(p.lastPrice) },
    priceDate: {
      value: p.lastPriceDate,
      display: formatPriceDate(p.lastPriceDate),
      isStale:
        p.lastPriceDate !== null && maxPriceDate !== null && p.lastPriceDate < maxPriceDate,
    },
    costBasis: { value: p.costBasis, display: formatCurrencyRounded(p.costBasis) },
    marketValue: { value: p.marketValue, display: formatCurrencyRounded(p.marketValue) },
    dividends: { value: p.totalDividends, display: formatCurrencyRounded(p.totalDividends) },
    sellProceeds: { value: p.totalSellProceeds, display: formatCurrencyRounded(p.totalSellProceeds) },
    pnl: { value: p.totalPnl, display: formatPnLRounded(p.totalPnl) },
    irr: { value: p.irr, display: formatIRRRounded(p.irr) },
    weight: { value: p.weight, display: formatPercent(p.weight) },
  }));
}

export function getClosedPositions(portfolio?: string): ClosedPositionRow[] {
  const { txInputs, fxRates, today, positions, nameMap } = fetchPositionInputs(portfolio);
  // Merge all positions by ticker FIRST so that a ticker active in one portfolio
  // but closed in another resolves to a single row, then split active/closed.
  const merged = !portfolio
    ? mergePositionsByTicker(positions, txInputs, fxRates, today)
    : positions;
  const closedPositions = merged.filter((p) => p.isClosed);

  return closedPositions.map((p) => ({
    ticker: p.ticker,
    companyName: nameMap[p.ticker] ?? null,
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    avgExit: { value: p.avgExitPrice, display: formatCurrency(p.avgExitPrice) },
    lastPrice: { value: p.lastPrice, display: formatCurrency(p.lastPrice) },
    totalInvested: { value: p.totalInvested, display: formatCurrencyRounded(p.totalInvested) },
    totalProceeds: { value: p.totalSellProceeds, display: formatCurrencyRounded(p.totalSellProceeds) },
    dividends: { value: p.totalDividends, display: formatCurrencyRounded(p.totalDividends) },
    realizedPnl: { value: p.totalPnl, display: formatPnLRounded(p.totalPnl) },
    irr: { value: p.irr, display: formatIRRRounded(p.irr) },
  }));
}
