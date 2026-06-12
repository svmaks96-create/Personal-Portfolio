import { computeAggregates, computePortfolioIRR, mergePositionsByTicker } from "@/server/services/computation";
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

interface MoneyCell {
  value: number | null;
  display: string;
}

export interface ActivePositionRow {
  ticker: string;
  companyName: string | null;
  instrument: "stock" | "option";
  markDate: string | null;
  hasInvalidState: boolean;
  shares: { value: number; display: string };
  avgEntry: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  priceDate: { value: string | null; display: string; isStale: boolean };
  costBasis: MoneyCell;
  marketValue: MoneyCell;
  dividends: MoneyCell;
  sellProceeds: MoneyCell;
  pnl: MoneyCell;
  realizedPnl: MoneyCell;
  unrealizedPnl: MoneyCell;
  irr: { value: number | null; display: string };
  weight: { value: number | null; display: string };
}

export interface ClosedPositionRow {
  ticker: string;
  companyName: string | null;
  instrument: "stock" | "option";
  avgEntry: { value: number | null; display: string };
  avgExit: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  totalInvested: MoneyCell;
  totalProceeds: MoneyCell;
  dividends: MoneyCell;
  realizedPnl: MoneyCell;
  irr: { value: number | null; display: string };
}

export interface ActivePositionsTotals {
  costBasis: MoneyCell;
  marketValue: MoneyCell;
  dividends: MoneyCell;
  sellProceeds: MoneyCell;
  pnl: MoneyCell;
  realizedPnl: MoneyCell;
  unrealizedPnl: MoneyCell;
  irr: { value: number | null; display: string };
  weight: { value: number | null; display: string };
}

export interface ClosedPositionsTotals {
  totalInvested: MoneyCell;
  totalProceeds: MoneyCell;
  dividends: MoneyCell;
  realizedPnl: MoneyCell;
  irr: { value: number | null; display: string };
}

export interface ActivePositionsResult {
  rows: ActivePositionRow[];
  totals: ActivePositionsTotals | null;
}

export interface ClosedPositionsResult {
  rows: ClosedPositionRow[];
  totals: ClosedPositionsTotals | null;
}

/**
 * Sum an optional numeric field across an iterable of rows. Returns `null`
 * the moment any row carries `null` — matches the null-propagation rule
 * used by `computeAggregates` so a single N/A row surfaces as N/A in the
 * total rather than being silently dropped.
 */
function sumOrNull<T>(rows: T[], pick: (r: T) => number | null): number | null {
  let total = 0;
  for (const r of rows) {
    const v = pick(r);
    if (v === null) return null;
    total += v;
  }
  return total;
}

export function getActivePositions(portfolio?: string): ActivePositionsResult {
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

  const rows: ActivePositionRow[] = aggregates.positions.map((p) => ({
    ticker: p.ticker,
    companyName: nameMap[p.ticker] ?? null,
    instrument: p.instrument,
    markDate: p.markDate,
    hasInvalidState: p.hasInvalidState,
    shares: { value: p.sharesHeld, display: formatShares(p.sharesHeld) },
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    lastPrice: {
      value: p.lastPrice,
      // Options have no quote by design — show a dash, not "N/A"
      display: p.instrument === "option" ? "—" : formatCurrency(p.lastPrice),
    },
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
    realizedPnl: { value: p.realizedPnl, display: formatPnLRounded(p.realizedPnl) },
    unrealizedPnl: { value: p.unrealizedPnl, display: formatPnLRounded(p.unrealizedPnl) },
    irr: { value: p.irr, display: formatIRRRounded(p.irr) },
    weight: { value: p.weight, display: formatPercent(p.weight) },
  }));

  if (rows.length === 0) {
    return { rows, totals: null };
  }

  const costBasisTotal = sumOrNull(rows, (r) => r.costBasis.value);
  const marketValueTotal = sumOrNull(rows, (r) => r.marketValue.value);
  const dividendsTotal = sumOrNull(rows, (r) => r.dividends.value);
  const sellProceedsTotal = sumOrNull(rows, (r) => r.sellProceeds.value);
  const pnlTotal = sumOrNull(rows, (r) => r.pnl.value);
  const realizedPnlTotal = sumOrNull(rows, (r) => r.realizedPnl.value);
  const unrealizedPnlTotal = sumOrNull(rows, (r) => r.unrealizedPnl.value);
  const weightTotal = sumOrNull(rows, (r) => r.weight.value);

  // Totals IRR is a fresh XIRR over the slice — per-row IRRs can't be summed.
  // Key by ticker + instrument so e.g. a closed stock position's cash flows
  // don't bleed into an active option line on the same underlying.
  const activeKeys = new Set(
    activePositions.map((p) => `${p.ticker}::${p.instrument}`)
  );
  const activeTxns = txInputs.filter((t) =>
    activeKeys.has(`${t.ticker}::${t.instrument}`)
  );
  const irrTotal = computePortfolioIRR(activeTxns, activePositions, fxRates, today);

  const totals: ActivePositionsTotals = {
    costBasis: { value: costBasisTotal, display: formatCurrencyRounded(costBasisTotal) },
    marketValue: { value: marketValueTotal, display: formatCurrencyRounded(marketValueTotal) },
    dividends: { value: dividendsTotal, display: formatCurrencyRounded(dividendsTotal) },
    sellProceeds: { value: sellProceedsTotal, display: formatCurrencyRounded(sellProceedsTotal) },
    pnl: { value: pnlTotal, display: formatPnLRounded(pnlTotal) },
    realizedPnl: { value: realizedPnlTotal, display: formatPnLRounded(realizedPnlTotal) },
    unrealizedPnl: { value: unrealizedPnlTotal, display: formatPnLRounded(unrealizedPnlTotal) },
    irr: { value: irrTotal, display: formatIRRRounded(irrTotal) },
    weight: { value: weightTotal, display: formatPercent(weightTotal) },
  };

  return { rows, totals };
}

export function getClosedPositions(portfolio?: string): ClosedPositionsResult {
  const { txInputs, fxRates, today, positions, nameMap } = fetchPositionInputs(portfolio);
  // Merge all positions by ticker FIRST so that a ticker active in one portfolio
  // but closed in another resolves to a single row, then split active/closed.
  const merged = !portfolio
    ? mergePositionsByTicker(positions, txInputs, fxRates, today)
    : positions;
  const closedPositions = merged.filter((p) => p.isClosed);

  const rows: ClosedPositionRow[] = closedPositions.map((p) => ({
    ticker: p.ticker,
    companyName: nameMap[p.ticker] ?? null,
    instrument: p.instrument,
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    avgExit: { value: p.avgExitPrice, display: formatCurrency(p.avgExitPrice) },
    lastPrice: {
      value: p.lastPrice,
      display: p.instrument === "option" ? "—" : formatCurrency(p.lastPrice),
    },
    totalInvested: { value: p.totalInvested, display: formatCurrencyRounded(p.totalInvested) },
    totalProceeds: { value: p.totalSellProceeds, display: formatCurrencyRounded(p.totalSellProceeds) },
    dividends: { value: p.totalDividends, display: formatCurrencyRounded(p.totalDividends) },
    realizedPnl: { value: p.realizedPnl, display: formatPnLRounded(p.realizedPnl) },
    irr: { value: p.irr, display: formatIRRRounded(p.irr) },
  }));

  if (rows.length === 0) {
    return { rows, totals: null };
  }

  const totalInvestedSum = sumOrNull(rows, (r) => r.totalInvested.value);
  const totalProceedsSum = sumOrNull(rows, (r) => r.totalProceeds.value);
  const dividendsSum = sumOrNull(rows, (r) => r.dividends.value);
  const realizedPnlSum = sumOrNull(rows, (r) => r.realizedPnl.value);

  // All positions here are closed, so computePortfolioIRR skips the terminal
  // market-value step and the XIRR runs over pure realized cashflows.
  const closedKeys = new Set(
    closedPositions.map((p) => `${p.ticker}::${p.instrument}`)
  );
  const closedTxns = txInputs.filter((t) =>
    closedKeys.has(`${t.ticker}::${t.instrument}`)
  );
  const irrTotal = computePortfolioIRR(closedTxns, closedPositions, fxRates, today);

  const totals: ClosedPositionsTotals = {
    totalInvested: { value: totalInvestedSum, display: formatCurrencyRounded(totalInvestedSum) },
    totalProceeds: { value: totalProceedsSum, display: formatCurrencyRounded(totalProceedsSum) },
    dividends: { value: dividendsSum, display: formatCurrencyRounded(dividendsSum) },
    realizedPnl: { value: realizedPnlSum, display: formatPnLRounded(realizedPnlSum) },
    irr: { value: irrTotal, display: formatIRRRounded(irrTotal) },
  };

  return { rows, totals };
}
