import { db } from "@/server/db";
import { transactions, marketData } from "@/server/db/schema";
import { eq, desc } from "drizzle-orm";
import { format } from "date-fns";
import { computePositions, computeAggregates, computePortfolioIRR, mergePositionsByTicker, computeConcentration } from "@/server/services/computation";
import { getEtfHoldingsMap } from "@/server/queries/etf-holdings";
import { formatPercent } from "@/lib/formatting";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
  AggregateMetrics,
} from "@/server/types/positions";
import type { ConcentrationData } from "@/server/types/concentration";

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

export function getConcentrationData(portfolio?: string): ConcentrationData {
  const metrics = getDashboardMetrics(portfolio);
  const activePositions = metrics.positions.filter((p) => !p.isClosed);

  // Determine which held tickers have ETF holdings cached
  const tickers = activePositions.map((p) => p.ticker);
  const etfHoldingsData = getEtfHoldingsMap(tickers);
  const etfTickers = Object.keys(etfHoldingsData);

  // Compute look-through concentration
  const rawHoldings = computeConcentration(activePositions, etfHoldingsData);

  // Format weights for display
  const holdings = rawHoldings.map((h) => ({
    ticker: h.ticker,
    weight: { value: h.weight, display: formatPercent(h.weight) },
    sources: h.sources,
  }));

  return { holdings, etfTickers };
}
