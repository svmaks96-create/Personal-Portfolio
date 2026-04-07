import Decimal from "decimal.js";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
  ComputedPosition,
  AggregateMetrics,
} from "@/server/types/positions";

export function lookupFxRate(
  currency: string,
  date: string,
  fxRates: FxRateInput[]
): number | null {
  if (currency === "USD") return 1;

  const pair = `${currency}USD`;
  let bestDate: string | null = null;
  let bestValue: number | null = null;

  for (const rate of fxRates) {
    if (rate.symbol !== pair) continue;
    if (rate.date > date) continue;
    if (bestDate === null || rate.date > bestDate) {
      bestDate = rate.date;
      bestValue = rate.value;
    }
  }

  return bestValue;
}

export function computePositions(
  transactions: TransactionInput[],
  marketData: Record<string, MarketDataInput>,
  fxRates: FxRateInput[]
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
    let missingFxRate = false;

    const first = group[0];
    const currency = first.currency;

    for (const t of group) {
      const qty = new Decimal(t.quantity);
      const price = new Decimal(t.price);
      const fees = new Decimal(t.fees);

      // Look up trade-date FX rate for non-USD currencies
      const fxRateValue = lookupFxRate(currency, t.date, fxRates);
      if (fxRateValue === null) {
        missingFxRate = true;
        // Still track shares even when FX rate is missing
        if (t.action === "buy") sharesHeld = sharesHeld.plus(qty);
        if (t.action === "sell") {
          sharesHeld = sharesHeld.minus(qty);
          if (sharesHeld.lessThan(0)) hasInvalidState = true;
        }
        continue;
      }
      const rate = new Decimal(fxRateValue);

      switch (t.action) {
        case "buy": {
          const buyCost = price.times(qty).plus(fees).times(rate);
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
          const sellProceeds = price.times(qty).minus(fees).times(rate);
          totalSellProceeds = totalSellProceeds.plus(sellProceeds);
          if (sharesHeld.lessThan(0)) {
            hasInvalidState = true;
          }
          break;
        }
        case "dividend": {
          const dividendAmount = qty.times(price).times(rate);
          totalDividends = totalDividends.plus(dividendAmount);
          break;
        }
        case "fee": {
          const feeUsd = fees.times(rate);
          costBasis = costBasis.plus(feeUsd);
          totalInvested = totalInvested.plus(feeUsd);
          break;
        }
      }
    }

    // If any non-USD transaction had a missing FX rate, null out monetary fields
    if (missingFxRate) {
      positions.push({
        ticker: first.ticker,
        portfolio: first.portfolio,
        currency,
        sharesHeld: sharesHeld.toNumber(),
        avgEntryPrice: null,
        costBasis: null,
        lastPrice: marketData[first.ticker]?.value ?? null,
        marketValue: null,
        totalDividends: null,
        totalSellProceeds: null,
        totalInvested: null,
        totalPnl: null,
        currentFxRate: null,
        cashReturned: null,
        isClosed: sharesHeld.isZero() && totalInvested.greaterThan(0),
        hasInvalidState,
      });
      continue;
    }

    // Average entry price — guard against division by zero
    const avgEntryPrice = sharesHeld.greaterThan(0)
      ? costBasis.div(sharesHeld)
      : new Decimal(0);

    const isClosed = sharesHeld.isZero() && totalInvested.greaterThan(0);

    // Market data lookup
    const md = marketData[first.ticker];
    const lastPrice = md ? md.value : null;

    // Look up FX rate for market value conversion
    // Use price-date when market data available (FR44); fall back to most recent for informational use
    const currentFxRate = md
      ? lookupFxRate(currency, md.date, fxRates)
      : lookupFxRate(currency, "9999-12-31", fxRates);

    let marketValue: number | null = null;
    let totalPnl: number | null = null;

    if (lastPrice !== null && !isClosed) {
      if (currentFxRate === null) {
        // Non-USD position with no FX rate for market value conversion
        marketValue = null;
        totalPnl = null;
      } else {
        const lastPriceDec = new Decimal(lastPrice);
        const fxDec = new Decimal(currentFxRate);
        marketValue = lastPriceDec.times(sharesHeld).times(fxDec).toNumber();
        totalPnl = lastPriceDec
          .times(sharesHeld)
          .times(fxDec)
          .plus(totalDividends)
          .plus(totalSellProceeds)
          .minus(totalInvested)
          .toNumber();
      }
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
      currency,
      sharesHeld: sharesHeld.toNumber(),
      avgEntryPrice: avgEntryPrice.toNumber(),
      costBasis: costBasis.toNumber(),
      lastPrice,
      marketValue,
      totalDividends: totalDividends.toNumber(),
      totalSellProceeds: totalSellProceeds.toNumber(),
      totalInvested: totalInvested.toNumber(),
      totalPnl,
      currentFxRate,
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
  let totalCostBasis: Decimal | null = new Decimal(0);
  let totalCashReturned: Decimal | null = new Decimal(0);
  let totalValue: Decimal | null = new Decimal(0);
  let totalPnl: Decimal | null = new Decimal(0);

  for (const pos of positions) {
    if (pos.costBasis !== null && totalCostBasis !== null) {
      totalCostBasis = totalCostBasis.plus(pos.costBasis);
    } else if (!pos.isClosed) {
      totalCostBasis = null;
    }

    if (pos.cashReturned !== null && totalCashReturned !== null) {
      totalCashReturned = totalCashReturned.plus(pos.cashReturned);
    } else if (!pos.isClosed) {
      totalCashReturned = null;
    }

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
  const totalCostBasisNum = totalCostBasis ? totalCostBasis.toNumber() : null;
  const totalCashReturnedNum = totalCashReturned ? totalCashReturned.toNumber() : null;

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
    totalCostBasis: totalCostBasisNum,
    totalPnl: totalPnlNum,
    totalCashReturned: totalCashReturnedNum,
    positions: weightedPositions,
  };
}
