/**
 * One-shot read-only snapshot of every portfolio's computed positions.
 * Reuses the app's exact computation chain (getActivePositions) so USD
 * normalization, FX, option marks, and weighted-avg cost all match the UI.
 *
 * Output: JSON to stdout. No writes. Safe to run anytime.
 */
import { getUniquePortfolios } from "../src/server/queries/portfolios";
import { getActivePositions, getClosedPositions } from "../src/server/queries/positions";

interface Holding {
  ticker: string;
  name: string | null;
  instrument: "stock" | "option";
  shares: number;
  costBasis: number | null;
  marketValue: number | null;
  pnl: number | null;
  realizedPnl: number | null;
  irr: number | null;
}

function snapshotPortfolio(portfolio: string | undefined) {
  const active = getActivePositions(portfolio);
  const closed = getClosedPositions(portfolio);
  const holdings: Holding[] = active.rows.map((r) => ({
    ticker: r.ticker,
    name: r.companyName,
    instrument: r.instrument,
    shares: r.shares.value,
    costBasis: r.costBasis.value,
    marketValue: r.marketValue.value,
    pnl: r.pnl.value,
    realizedPnl: r.realizedPnl.value,
    irr: r.irr.value,
  }));
  return {
    portfolio: portfolio ?? "ALL",
    totalMarketValue: active.totals?.marketValue.value ?? null,
    totalCostBasis: active.totals?.costBasis.value ?? null,
    totalPnl: active.totals?.pnl.value ?? null,
    totalUnrealizedPnl: active.totals?.unrealizedPnl.value ?? null,
    totalRealizedPnl: active.totals?.realizedPnl.value ?? null,
    irr: active.totals?.irr.value ?? null,
    closedRealizedPnl: closed.totals?.realizedPnl.value ?? null,
    holdings: holdings.sort(
      (a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0)
    ),
  };
}

const portfolios = getUniquePortfolios();
const out = {
  generatedAt: new Date().toISOString(),
  portfolios,
  combined: snapshotPortfolio(undefined),
  byPortfolio: portfolios.map((p) => snapshotPortfolio(p)),
};

process.stdout.write(JSON.stringify(out, null, 2));
