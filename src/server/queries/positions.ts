import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { computePositions, computeAggregates, mergePositionsByTicker } from "@/server/services/computation";
import { format } from "date-fns";
import {
  formatCurrency,
  formatCurrencyRounded,
  formatShares,
  formatPercent,
  formatPnLRounded,
  formatIRRRounded,
} from "@/lib/formatting";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

export interface ActivePositionRow {
  ticker: string;
  companyName: string | null;
  hasInvalidState: boolean;
  shares: { value: number; display: string };
  avgEntry: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
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

function fetchPositionInputs(portfolio?: string) {
  // 1. Fetch transactions
  const txRows = portfolio
    ? db.select().from(transactions).where(eq(transactions.portfolio, portfolio)).all()
    : db.select().from(transactions).all();

  const txInputs: TransactionInput[] = txRows.map((row) => ({
    id: row.id,
    date: row.date,
    ticker: row.ticker,
    action: row.action,
    quantity: row.quantity,
    grossAmount: row.grossAmount,
    fees: row.fees,
    portfolio: row.portfolio,
    currency: row.currency,
  }));

  // 2. Fetch latest stock prices (most recent per symbol)
  const priceRows = db
    .select()
    .from(marketData)
    .where(eq(marketData.type, "stock_price"))
    .orderBy(desc(marketData.date))
    .all();

  const priceMap: Record<string, MarketDataInput> = {};
  const nameMap: Record<string, string> = {};
  for (const row of priceRows) {
    if (!(row.symbol in priceMap)) {
      priceMap[row.symbol] = {
        symbol: row.symbol,
        date: row.date,
        value: row.value,
      };
      if (row.name) {
        nameMap[row.symbol] = row.name;
      }
    }
  }

  // 3. Fetch FX rates
  const fxRows = db
    .select()
    .from(marketData)
    .where(eq(marketData.type, "fx_rate"))
    .all();

  const fxRates: FxRateInput[] = fxRows.map((row) => ({
    symbol: row.symbol,
    date: row.date,
    value: row.value,
  }));

  const today = format(new Date(), "yyyy-MM-dd");
  const positions = computePositions(txInputs, priceMap, fxRates, today);

  return { txInputs, fxRates, today, positions, nameMap };
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

  return aggregates.positions.map((p) => ({
    ticker: p.ticker,
    companyName: nameMap[p.ticker] ?? null,
    hasInvalidState: p.hasInvalidState,
    shares: { value: p.sharesHeld, display: formatShares(p.sharesHeld) },
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    lastPrice: { value: p.lastPrice, display: formatCurrency(p.lastPrice) },
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
