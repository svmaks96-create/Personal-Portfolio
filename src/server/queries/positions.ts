import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { computePositions, computeAggregates } from "@/server/services/computation";
import {
  formatCurrency,
  formatShares,
  formatPercent,
  formatPnL,
} from "@/lib/formatting";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
  ComputedPosition,
} from "@/server/types/positions";

export interface ActivePositionRow {
  ticker: string;
  portfolio: string;
  hasInvalidState: boolean;
  shares: { value: number; display: string };
  avgEntry: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  costBasis: { value: number | null; display: string };
  marketValue: { value: number | null; display: string };
  dividends: { value: number | null; display: string };
  sellProceeds: { value: number | null; display: string };
  pnl: { value: number | null; display: string };
  weight: { value: number | null; display: string };
}

export interface ClosedPositionRow {
  ticker: string;
  portfolio: string;
  avgEntry: { value: number | null; display: string };
  avgExit: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  totalInvested: { value: number | null; display: string };
  totalProceeds: { value: number | null; display: string };
  dividends: { value: number | null; display: string };
  realizedPnl: { value: number | null; display: string };
}

function computeAllPositions(portfolio?: string): ComputedPosition[] {
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
    price: row.price,
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
  for (const row of priceRows) {
    if (!(row.symbol in priceMap)) {
      priceMap[row.symbol] = {
        symbol: row.symbol,
        date: row.date,
        value: row.value,
      };
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

  // 4. Compute positions
  return computePositions(txInputs, priceMap, fxRates);
}

export function getActivePositions(portfolio?: string): ActivePositionRow[] {
  const positions = computeAllPositions(portfolio);
  const activePositions = positions.filter((p) => !p.isClosed);
  const aggregates = computeAggregates(activePositions);

  return aggregates.positions.map((p) => ({
    ticker: p.ticker,
    portfolio: p.portfolio,
    hasInvalidState: p.hasInvalidState,
    shares: { value: p.sharesHeld, display: formatShares(p.sharesHeld) },
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    lastPrice: { value: p.lastPrice, display: formatCurrency(p.lastPrice) },
    costBasis: { value: p.costBasis, display: formatCurrency(p.costBasis) },
    marketValue: { value: p.marketValue, display: formatCurrency(p.marketValue) },
    dividends: { value: p.totalDividends, display: formatCurrency(p.totalDividends) },
    sellProceeds: { value: p.totalSellProceeds, display: formatCurrency(p.totalSellProceeds) },
    pnl: { value: p.totalPnl, display: formatPnL(p.totalPnl) },
    weight: { value: p.weight, display: formatPercent(p.weight) },
  }));
}

export function getClosedPositions(portfolio?: string): ClosedPositionRow[] {
  const positions = computeAllPositions(portfolio);
  const closedPositions = positions.filter((p) => p.isClosed);

  return closedPositions.map((p) => ({
    ticker: p.ticker,
    portfolio: p.portfolio,
    avgEntry: { value: p.avgEntryPrice, display: formatCurrency(p.avgEntryPrice) },
    avgExit: { value: p.avgExitPrice, display: formatCurrency(p.avgExitPrice) },
    lastPrice: { value: p.lastPrice, display: formatCurrency(p.lastPrice) },
    totalInvested: { value: p.totalInvested, display: formatCurrency(p.totalInvested) },
    totalProceeds: { value: p.totalSellProceeds, display: formatCurrency(p.totalSellProceeds) },
    dividends: { value: p.totalDividends, display: formatCurrency(p.totalDividends) },
    realizedPnl: { value: p.totalPnl, display: formatPnL(p.totalPnl) },
  }));
}
