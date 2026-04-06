import Decimal from "decimal.js";
import type {
  TransactionInput,
  MarketDataInput,
  ComputedPosition,
  AggregateMetrics,
} from "@/server/types/positions";

export function computePositions(
  transactions: TransactionInput[],
  marketData: Record<string, MarketDataInput>
): ComputedPosition[] {
  // Group transactions by ticker + portfolio
  const groups = new Map<string, TransactionInput[]>();
  for (const t of transactions) {
    const key = `${t.ticker}::${t.portfolio}`;
    const group = groups.get(key);
    if (group) {
      group.push(t);
    } else {
      groups.set(key, [t]);
    }
  }

  const positions: ComputedPosition[] = [];

  for (const [, group] of groups) {
    // Sort chronologically, stable by id for same-date transactions
    group.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    let sharesHeld = new Decimal(0);
    let costBasis = new Decimal(0);
    let totalInvested = new Decimal(0);
    let totalDividends = new Decimal(0);
    let totalSellProceeds = new Decimal(0);
    let hasInvalidState = false;

    const first = group[0];

    for (const t of group) {
      const qty = new Decimal(t.quantity);
      const price = new Decimal(t.price);
      const fees = new Decimal(t.fees);

      switch (t.action) {
        case "buy": {
          const buyCost = price.times(qty).plus(fees);
          sharesHeld = sharesHeld.plus(qty);
          costBasis = costBasis.plus(buyCost);
          totalInvested = totalInvested.plus(buyCost);
          break;
        }
        case "sell": {
          if (sharesHeld.greaterThan(0)) {
            const reduction = qty.div(sharesHeld).times(costBasis);
            costBasis = costBasis.minus(reduction);
          }
          sharesHeld = sharesHeld.minus(qty);
          const sellProceeds = price.times(qty).minus(fees);
          totalSellProceeds = totalSellProceeds.plus(sellProceeds);
          if (sharesHeld.lessThan(0)) {
            hasInvalidState = true;
          }
          break;
        }
        case "dividend": {
          const dividendAmount = qty.times(price);
          totalDividends = totalDividends.plus(dividendAmount);
          break;
        }
        case "fee": {
          costBasis = costBasis.plus(fees);
          totalInvested = totalInvested.plus(fees);
          break;
        }
      }
    }

    // Average entry price — guard against division by zero
    const avgEntryPrice = sharesHeld.greaterThan(0)
      ? costBasis.div(sharesHeld)
      : new Decimal(0);

    const isClosed = sharesHeld.isZero() && totalInvested.greaterThan(0);

    // Market data lookup
    const md = marketData[first.ticker];
    const lastPrice = md ? md.value : null;

    let marketValue: number | null = null;
    let totalPnl: number | null = null;

    if (lastPrice !== null && !isClosed) {
      const lastPriceDec = new Decimal(lastPrice);
      marketValue = lastPriceDec.times(sharesHeld).toNumber();
      totalPnl = lastPriceDec
        .times(sharesHeld)
        .plus(totalDividends)
        .plus(totalSellProceeds)
        .minus(totalInvested)
        .toNumber();
    } else if (isClosed) {
      // Closed positions: market value is 0, P&L is fully realized
      marketValue = 0;
      totalPnl = totalSellProceeds
        .plus(totalDividends)
        .minus(totalInvested)
        .toNumber();
    }

    positions.push({
      ticker: first.ticker,
      portfolio: first.portfolio,
      currency: first.currency,
      sharesHeld: sharesHeld.toNumber(),
      avgEntryPrice: avgEntryPrice.toNumber(),
      costBasis: costBasis.toNumber(),
      lastPrice,
      marketValue,
      totalDividends: totalDividends.toNumber(),
      totalSellProceeds: totalSellProceeds.toNumber(),
      totalInvested: totalInvested.toNumber(),
      totalPnl,
      cashReturned: totalDividends.plus(totalSellProceeds).toNumber(),
      isClosed,
      hasInvalidState,
    });
  }

  return positions;
}

export function computeAggregates(
  positions: ComputedPosition[]
): AggregateMetrics {
  let totalCostBasis = new Decimal(0);
  let totalCashReturned = new Decimal(0);
  let totalValue: Decimal | null = new Decimal(0);
  let totalPnl: Decimal | null = new Decimal(0);

  for (const pos of positions) {
    totalCostBasis = totalCostBasis.plus(pos.costBasis);
    totalCashReturned = totalCashReturned.plus(pos.cashReturned);

    if (pos.marketValue !== null && totalValue !== null) {
      totalValue = totalValue.plus(pos.marketValue);
    } else if (!pos.isClosed) {
      totalValue = null;
    }

    if (pos.totalPnl !== null && totalPnl !== null) {
      totalPnl = totalPnl.plus(pos.totalPnl);
    } else if (!pos.isClosed) {
      totalPnl = null;
    }
  }

  const totalValueNum = totalValue ? totalValue.toNumber() : null;
  const totalPnlNum = totalPnl ? totalPnl.toNumber() : null;

  const weightedPositions = positions.map((pos) => {
    let weight: number | null = null;
    if (totalValueNum !== null && totalValueNum > 0 && pos.marketValue !== null) {
      weight = new Decimal(pos.marketValue)
        .div(totalValueNum)
        .times(100)
        .toNumber();
    }
    return { ...pos, weight };
  });

  return {
    totalValue: totalValueNum,
    totalCostBasis: totalCostBasis.toNumber(),
    totalPnl: totalPnlNum,
    totalCashReturned: totalCashReturned.toNumber(),
    positions: weightedPositions,
  };
}
