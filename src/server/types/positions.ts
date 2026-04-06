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

export interface ComputedPosition {
  ticker: string;
  portfolio: string;
  currency: string;
  sharesHeld: number;
  avgEntryPrice: number;
  costBasis: number;
  lastPrice: number | null;
  marketValue: number | null;
  totalDividends: number;
  totalSellProceeds: number;
  totalInvested: number;
  totalPnl: number | null;
  cashReturned: number;
  isClosed: boolean;
  hasInvalidState: boolean;
}

export interface AggregateMetrics {
  totalValue: number | null;
  totalCostBasis: number;
  totalPnl: number | null;
  totalCashReturned: number;
  positions: (ComputedPosition & { weight: number | null })[];
}
