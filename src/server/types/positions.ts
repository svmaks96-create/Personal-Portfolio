export interface TransactionInput {
  id: number;
  date: string;
  ticker: string;
  action: "buy" | "sell" | "dividend" | "fee";
  quantity: number;
  price: number;
  fees: number;
  portfolio: string;
  currency: string;
}

export interface MarketDataInput {
  symbol: string;
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
  avgEntryPrice: number | null;
  costBasis: number | null;
  lastPrice: number | null;
  marketValue: number | null;
  totalDividends: number | null;
  totalSellProceeds: number | null;
  totalInvested: number | null;
  totalPnl: number | null;
  currentFxRate: number | null;
  cashReturned: number | null;
  isClosed: boolean;
  hasInvalidState: boolean;
}

export interface AggregateMetrics {
  totalValue: number | null;
  totalCostBasis: number | null;
  totalPnl: number | null;
  totalCashReturned: number | null;
  positions: (ComputedPosition & { weight: number | null })[];
}
