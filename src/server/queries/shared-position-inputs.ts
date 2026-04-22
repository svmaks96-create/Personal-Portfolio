import { cache } from "react";
import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { computePositions } from "@/server/services/computation";
import { format } from "date-fns";
import { getTickerProfilesMap } from "@/server/queries/ticker-profiles";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
  ComputedPosition,
} from "@/server/types/positions";

export interface PositionInputs {
  txInputs: TransactionInput[];
  priceMap: Record<string, MarketDataInput>;
  fxRates: FxRateInput[];
  today: string;
  positions: ComputedPosition[];
  nameMap: Record<string, string>;
}

export const fetchPositionInputs = cache((portfolio?: string): PositionInputs => {
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
  for (const row of priceRows) {
    if (!(row.symbol in priceMap)) {
      priceMap[row.symbol] = {
        symbol: row.symbol,
        date: row.date,
        value: row.value,
      };
    }
  }

  // Company names come from the symbol-level ticker_profiles table, not from
  // per-date price rows. Missing profiles render as "no name" in the UI.
  const profilesMap = getTickerProfilesMap();
  const nameMap: Record<string, string> = {};
  for (const [ticker, profile] of Object.entries(profilesMap)) {
    if (profile.name) {
      nameMap[ticker] = profile.name;
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

  return { txInputs, priceMap, fxRates, today, positions, nameMap };
});
