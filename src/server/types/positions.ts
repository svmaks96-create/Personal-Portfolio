export interface TransactionInput {
  id: number;
  date: string;
  ticker: string;
  action: "buy" | "sell" | "dividend" | "fee";
  quantity: number;
  grossAmount: number;
  fees: number;
  portfolio: string;
  currency: string;
}

export interface MarketDataInput {
  symbol: string;
  date: string;    // ISO date string for the price observation
  value: number;
}

export interface FxRateInput {
  symbol: string;  // Currency pair, e.g., "GBPUSD", "EURUSD"
  date: string;    // ISO date string, e.g., "2025-05-10"
  value: number;   // Exchange rate (multiply native currency by this to get USD)
}

export interface ComputedPosition {
  ticker: string;
  portfolio: string;
  currency: string;
  sharesHeld: number;
  totalSharesBought: number;
  totalSharesSold: number;
  avgEntryPrice: number | null;
  avgExitPrice: number | null;
  costBasis: number | null;
  lastPrice: number | null;
  marketValue: number | null;
  totalDividends: number | null;
  totalSellProceeds: number | null;
  totalInvested: number | null;
  totalPnl: number | null;
  currentFxRate: number | null;
  cashReturned: number | null;
  irr: number | null;
  isClosed: boolean;
  hasInvalidState: boolean;
}

export interface AggregateMetrics {
  totalValue: number | null;
  totalCostBasis: number | null;
  totalPnl: number | null;
  totalCashReturned: number | null;
  irr: number | null;
  positions: (ComputedPosition & { weight: number | null })[];
}
