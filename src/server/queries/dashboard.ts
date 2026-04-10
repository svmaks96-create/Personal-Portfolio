import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { computePositions, computeAggregates, computePortfolioIRR, mergePositionsByTicker } from "@/server/services/computation";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
  AggregateMetrics,
} from "@/server/types/positions";

export function getDashboardMetrics(portfolio?: string): AggregateMetrics {
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

  // 4. Compute positions and aggregates (active positions only)
  const today = format(new Date(), "yyyy-MM-dd");
  const allPositions = computePositions(txInputs, priceMap, fxRates, today);
  const positions = !portfolio
    ? mergePositionsByTicker(allPositions, txInputs, fxRates, today)
    : allPositions;
  const activePositions = positions.filter((p) => !p.isClosed);
  const aggregates = computeAggregates(activePositions);

  // 5. Compute portfolio-level IRR from all transactions (including closed positions)
  aggregates.irr = computePortfolioIRR(txInputs, positions, fxRates, today);

  return aggregates;
}
