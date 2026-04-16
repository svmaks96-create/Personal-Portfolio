import { computeAggregates, computePortfolioIRR, mergePositionsByTicker, computeConcentration } from "@/server/services/computation";
import { getEtfHoldingsMap, getVariantToTickerMap } from "@/server/queries/etf-holdings";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { formatPercent } from "@/lib/formatting";
import type { AggregateMetrics } from "@/server/types/positions";
import type { ConcentrationData } from "@/server/types/concentration";

export function getDashboardMetrics(portfolio?: string): AggregateMetrics {
  const { txInputs, fxRates, today, positions: allPositions } = fetchPositionInputs(portfolio);
  // Merge all positions by ticker FIRST so that a ticker active in one portfolio
  // but closed in another resolves to a single row, then filter to active.
  const merged = !portfolio
    ? mergePositionsByTicker(allPositions, txInputs, fxRates, today)
    : allPositions;
  const positions = merged.filter((p) => !p.isClosed);
  const aggregates = computeAggregates(positions);

  // 5. Compute portfolio-level IRR from all transactions (including closed positions)
  aggregates.irr = computePortfolioIRR(txInputs, allPositions, fxRates, today);

  return aggregates;
}

export function getConcentrationData(portfolio?: string): ConcentrationData {
  const metrics = getDashboardMetrics(portfolio);
  const activePositions = metrics.positions.filter((p) => !p.isClosed);

  // Determine which held tickers have ETF holdings cached
  const tickers = activePositions.map((p) => p.ticker);
  const etfHoldingsData = getEtfHoldingsMap(tickers);
  const etfTickers = Object.keys(etfHoldingsData);

  // Get variant mappings for cross-listed securities (e.g., 2330.TW → TSM)
  const variantToTicker = getVariantToTickerMap(tickers);

  // Compute look-through concentration with variant resolution
  const rawHoldings = computeConcentration(activePositions, etfHoldingsData, variantToTicker);

  // Format weights for display
  const holdings = rawHoldings.map((h) => ({
    ticker: h.ticker,
    weight: { value: h.weight, display: formatPercent(h.weight) },
    sources: h.sources,
  }));

  return { holdings, etfTickers };
}
