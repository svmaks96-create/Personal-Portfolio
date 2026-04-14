import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
  ComputedPosition,
  AggregateMetrics,
} from "@/server/types/positions";
import type { ConcentrationSource } from "@/server/types/concentration";

interface CashFlow {
  date: string;
  amount: number; // negative = outflow, positive = inflow
}

/**
 * XIRR solver using Newton-Raphson.
 * Returns annualized rate as a percentage (e.g. 12.5 for 12.5%), or null if unsolvable.
 */
export function computeXIRR(cashFlows: CashFlow[]): number | null {
  if (cashFlows.length < 2) return null;

  const hasPositive = cashFlows.some((cf) => cf.amount > 0);
  const hasNegative = cashFlows.some((cf) => cf.amount < 0);
  if (!hasPositive || !hasNegative) return null;

  const d0 = parseISO(cashFlows[0].date);
  const years = cashFlows.map(
    (cf) => differenceInDays(parseISO(cf.date), d0) / 365
  );
  const amounts = cashFlows.map((cf) => cf.amount);

  let rate = 0.1;

  for (let iter = 0; iter < 200; iter++) {
    let f = 0;
    let df = 0;

    for (let j = 0; j < amounts.length; j++) {
      const t = years[j];
      const base = 1 + rate;
      if (base <= 0) {
        // Can't raise non-positive base to fractional power
        rate = rate / 2 + 0.01;
        continue;
      }
      const denom = Math.pow(base, t);
      f += amounts[j] / denom;
      df -= (t * amounts[j]) / Math.pow(base, t + 1);
    }

    if (Math.abs(df) < 1e-12) return null;

    const step = f / df;
    const newRate = rate - step;

    if (Math.abs(newRate - rate) < 1e-9) {
      return newRate * 100;
    }

    // Dampen if diverging
    if (newRate < -0.99) {
      rate = -0.99 + (rate + 0.99) / 2;
    } else if (newRate > 1e4) {
      rate = rate + (1e4 - rate) / 2;
    } else {
      rate = newRate;
    }
  }

  return null;
}

function buildUsdCashFlows(
  transactions: TransactionInput[],
  fxRates: FxRateInput[]
): CashFlow[] {
  const flows: CashFlow[] = [];

  for (const t of transactions) {
    const fxRate = lookupFxRate(t.currency, t.date, fxRates);
    if (fxRate === null) continue;

    const rate = new Decimal(fxRate);
    const gross = new Decimal(t.grossAmount);
    const fees = new Decimal(t.fees);

    switch (t.action) {
      case "buy":
        flows.push({
          date: t.date,
          amount: gross.plus(fees).times(rate).neg().toNumber(),
        });
        break;
      case "sell":
        flows.push({
          date: t.date,
          amount: gross.minus(fees).times(rate).toNumber(),
        });
        break;
      case "dividend":
        flows.push({
          date: t.date,
          amount: gross.times(rate).toNumber(),
        });
        break;
      case "fee":
        flows.push({
          date: t.date,
          amount: fees.times(rate).neg().toNumber(),
        });
        break;
    }
  }

  flows.sort((a, b) => a.date.localeCompare(b.date));
  return flows;
}

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
  fxRates: FxRateInput[],
  today: string
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
    let totalSharesBought = new Decimal(0);
    let totalSharesSold = new Decimal(0);
    let hasInvalidState = false;
    let missingFxRate = false;

    const first = group[0];
    const currency = first.currency;

    for (const t of group) {
      const qty = new Decimal(t.quantity);
      const grossAmount = new Decimal(t.grossAmount);
      const fees = new Decimal(t.fees);

      // Look up trade-date FX rate for non-USD currencies
      const fxRateValue = lookupFxRate(currency, t.date, fxRates);
      if (fxRateValue === null) {
        missingFxRate = true;
        // Still track shares even when FX rate is missing
        if (t.action === "buy") {
          sharesHeld = sharesHeld.plus(qty);
          totalSharesBought = totalSharesBought.plus(qty);
        }
        if (t.action === "sell") {
          sharesHeld = sharesHeld.minus(qty);
          totalSharesSold = totalSharesSold.plus(qty);
          if (sharesHeld.lessThan(0)) hasInvalidState = true;
        }
        continue;
      }
      const rate = new Decimal(fxRateValue);

      switch (t.action) {
        case "buy": {
          const buyCost = grossAmount.plus(fees).times(rate);
          sharesHeld = sharesHeld.plus(qty);
          totalSharesBought = totalSharesBought.plus(qty);
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
          totalSharesSold = totalSharesSold.plus(qty);
          const sellProceeds = grossAmount.minus(fees).times(rate);
          totalSellProceeds = totalSellProceeds.plus(sellProceeds);
          if (sharesHeld.lessThan(0)) {
            hasInvalidState = true;
          }
          break;
        }
        case "dividend": {
          const dividendAmount = grossAmount.times(rate);
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
        totalSharesBought: totalSharesBought.toNumber(),
        totalSharesSold: totalSharesSold.toNumber(),
        avgEntryPrice: null,
        avgExitPrice: null,
        costBasis: null,
        lastPrice: marketData[first.ticker]?.value ?? null,
        marketValue: null,
        totalDividends: null,
        totalSellProceeds: null,
        totalInvested: null,
        totalPnl: null,
        currentFxRate: null,
        cashReturned: null,
        irr: null,
        isClosed: sharesHeld.isZero() && totalInvested.greaterThan(0),
        hasInvalidState,
      });
      continue;
    }

    // Average entry price (cost-inclusive): totalInvested / totalSharesBought
    const avgEntryPrice = totalSharesBought.greaterThan(0)
      ? totalInvested.div(totalSharesBought)
      : new Decimal(0);

    // Average exit price: total sell proceeds / total shares sold
    const avgExitPrice = totalSharesSold.greaterThan(0)
      ? totalSellProceeds.div(totalSharesSold)
      : null;

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

    // Compute position-level IRR from cash flows + terminal value
    const positionFlows = buildUsdCashFlows(group, fxRates);
    if (!isClosed && marketValue !== null) {
      positionFlows.push({ date: today, amount: marketValue });
    }
    const irr = computeXIRR(positionFlows);

    positions.push({
      ticker: first.ticker,
      portfolio: first.portfolio,
      currency,
      sharesHeld: sharesHeld.toNumber(),
      totalSharesBought: totalSharesBought.toNumber(),
      totalSharesSold: totalSharesSold.toNumber(),
      avgEntryPrice: avgEntryPrice.toNumber(),
      avgExitPrice: avgExitPrice ? avgExitPrice.toNumber() : null,
      costBasis: costBasis.toNumber(),
      lastPrice,
      marketValue,
      totalDividends: totalDividends.toNumber(),
      totalSellProceeds: totalSellProceeds.toNumber(),
      totalInvested: totalInvested.toNumber(),
      totalPnl,
      currentFxRate,
      cashReturned: totalDividends.plus(totalSellProceeds).toNumber(),
      irr,
      isClosed,
      hasInvalidState,
    });
  }

  return positions;
}

/**
 * Merge positions with the same ticker into a single aggregated row.
 * Used in "All Portfolios" view to combine cross-portfolio holdings.
 */
export function mergePositionsByTicker(
  positions: ComputedPosition[],
  transactions: TransactionInput[],
  fxRates: FxRateInput[],
  today: string
): ComputedPosition[] {
  const groups = new Map<string, ComputedPosition[]>();
  for (const pos of positions) {
    const group = groups.get(pos.ticker);
    if (group) {
      group.push(pos);
    } else {
      groups.set(pos.ticker, [pos]);
    }
  }

  const merged: ComputedPosition[] = [];

  for (const [ticker, group] of groups) {
    if (group.length === 1) {
      merged.push({ ...group[0], portfolio: "All" });
      continue;
    }

    // Sum additive fields using Decimal, with null propagation
    let sumSharesHeld = new Decimal(0);
    let sumSharesBought = new Decimal(0);
    let sumSharesSold = new Decimal(0);
    let sumCostBasis: Decimal | null = new Decimal(0);
    let sumMarketValue: Decimal | null = new Decimal(0);
    let sumDividends: Decimal | null = new Decimal(0);
    let sumSellProceeds: Decimal | null = new Decimal(0);
    let sumInvested: Decimal | null = new Decimal(0);
    let sumCashReturned: Decimal | null = new Decimal(0);
    let hasInvalidState = false;
    let allClosed = true;

    for (const pos of group) {
      sumSharesHeld = sumSharesHeld.plus(pos.sharesHeld);
      sumSharesBought = sumSharesBought.plus(pos.totalSharesBought);
      sumSharesSold = sumSharesSold.plus(pos.totalSharesSold);
      hasInvalidState = hasInvalidState || pos.hasInvalidState;
      if (!pos.isClosed) allClosed = false;

      // Null propagation: if any non-closed position has null, the sum becomes null
      if (pos.costBasis !== null && sumCostBasis !== null) {
        sumCostBasis = sumCostBasis.plus(pos.costBasis);
      } else if (!pos.isClosed) {
        sumCostBasis = null;
      }

      if (pos.marketValue !== null && sumMarketValue !== null) {
        sumMarketValue = sumMarketValue.plus(pos.marketValue);
      } else if (!pos.isClosed) {
        sumMarketValue = null;
      }

      if (pos.totalDividends !== null && sumDividends !== null) {
        sumDividends = sumDividends.plus(pos.totalDividends);
      } else if (!pos.isClosed) {
        sumDividends = null;
      }

      if (pos.totalSellProceeds !== null && sumSellProceeds !== null) {
        sumSellProceeds = sumSellProceeds.plus(pos.totalSellProceeds);
      } else if (!pos.isClosed) {
        sumSellProceeds = null;
      }

      if (pos.totalInvested !== null && sumInvested !== null) {
        sumInvested = sumInvested.plus(pos.totalInvested);
      } else if (!pos.isClosed) {
        sumInvested = null;
      }

      if (pos.cashReturned !== null && sumCashReturned !== null) {
        sumCashReturned = sumCashReturned.plus(pos.cashReturned);
      } else if (!pos.isClosed) {
        sumCashReturned = null;
      }
    }

    // Recompute derived fields
    const avgEntryPrice =
      sumInvested !== null && sumSharesBought.greaterThan(0)
        ? sumInvested.div(sumSharesBought).toNumber()
        : null;

    const avgExitPrice =
      sumSellProceeds !== null && sumSharesSold.greaterThan(0)
        ? sumSellProceeds.div(sumSharesSold).toNumber()
        : null;

    // Recompute totalPnl
    let totalPnl: number | null = null;
    if (allClosed) {
      if (sumSellProceeds !== null && sumDividends !== null && sumInvested !== null) {
        totalPnl = sumSellProceeds.plus(sumDividends).minus(sumInvested).toNumber();
      }
    } else {
      if (sumMarketValue !== null && sumDividends !== null && sumSellProceeds !== null && sumInvested !== null) {
        totalPnl = sumMarketValue.plus(sumDividends).plus(sumSellProceeds).minus(sumInvested).toNumber();
      }
    }

    // Recompute IRR from combined cash flows
    const tickerTxns = transactions.filter((t) => t.ticker === ticker);
    const flows = buildUsdCashFlows(tickerTxns, fxRates);
    const marketValueNum = sumMarketValue ? sumMarketValue.toNumber() : null;
    if (!allClosed && marketValueNum !== null) {
      flows.push({ date: today, amount: marketValueNum });
    }
    const irr = computeXIRR(flows);

    // Pass-through fields from first position (same ticker = same values)
    const first = group[0];

    merged.push({
      ticker,
      portfolio: "All",
      currency: first.currency,
      sharesHeld: sumSharesHeld.toNumber(),
      totalSharesBought: sumSharesBought.toNumber(),
      totalSharesSold: sumSharesSold.toNumber(),
      avgEntryPrice,
      avgExitPrice,
      costBasis: sumCostBasis ? sumCostBasis.toNumber() : null,
      lastPrice: first.lastPrice,
      marketValue: marketValueNum,
      totalDividends: sumDividends ? sumDividends.toNumber() : null,
      totalSellProceeds: sumSellProceeds ? sumSellProceeds.toNumber() : null,
      totalInvested: sumInvested ? sumInvested.toNumber() : null,
      totalPnl,
      currentFxRate: first.currentFxRate,
      cashReturned: sumCashReturned ? sumCashReturned.toNumber() : null,
      irr,
      isClosed: allClosed,
      hasInvalidState,
    });
  }

  return merged;
}

export function computePortfolioIRR(
  transactions: TransactionInput[],
  positions: ComputedPosition[],
  fxRates: FxRateInput[],
  today: string
): number | null {
  const flows = buildUsdCashFlows(transactions, fxRates);

  // Add terminal market value for active positions
  for (const pos of positions) {
    if (!pos.isClosed && pos.marketValue !== null) {
      flows.push({ date: today, amount: pos.marketValue });
    }
  }

  flows.sort((a, b) => a.date.localeCompare(b.date));
  return computeXIRR(flows);
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
    irr: null,
    positions: weightedPositions,
  };
}

const CONCENTRATION_TOP_N = 20;

/**
 * Compute portfolio concentration on a look-through basis.
 * ETF positions are decomposed into their underlying holdings.
 * Direct and ETF-sourced weights for the same ticker are combined.
 * Uses variantToTicker mapping to consolidate cross-listed securities
 * (e.g., 2330.TW in an ETF is mapped to the user's TSM holding).
 * Returns top N holdings sorted by combined weight, with remainder as "Other".
 */
export function computeConcentration(
  positions: (ComputedPosition & { weight: number | null })[],
  etfHoldingsMap: Record<string, { asset: string; weightPercentage: number }[]>,
  variantToTicker: Record<string, string> = {}
): { ticker: string; weight: number; sources: ConcentrationSource[] }[] {
  // Phase 1: Accumulate per-ticker weights with source tracking
  const accumulator = new Map<
    string,
    { totalWeight: Decimal; sources: ConcentrationSource[] }
  >();

  function addWeight(ticker: string, weight: Decimal, source: ConcentrationSource) {
    const existing = accumulator.get(ticker);
    if (existing) {
      existing.totalWeight = existing.totalWeight.plus(weight);
      existing.sources.push(source);
    } else {
      accumulator.set(ticker, { totalWeight: weight, sources: [source] });
    }
  }

  for (const pos of positions) {
    if (pos.weight === null || pos.isClosed) continue;

    const posWeight = new Decimal(pos.weight);
    const holdings = etfHoldingsMap[pos.ticker];

    if (holdings) {
      // ETF: decompose into underlying holdings
      for (const holding of holdings) {
        const contributedWeight = posWeight
          .times(holding.weightPercentage)
          .div(100);

        // Resolve variant ticker to user's ticker (e.g., 2330.TW → TSM)
        const resolvedTicker = variantToTicker[holding.asset] ?? holding.asset;

        const source: ConcentrationSource = {
          type: "etf",
          etfTicker: pos.ticker,
          weight: contributedWeight.toNumber(),
        };

        addWeight(resolvedTicker, contributedWeight, source);
      }
    } else {
      // Stock: add weight directly
      const source: ConcentrationSource = {
        type: "direct",
        weight: posWeight.toNumber(),
      };

      addWeight(pos.ticker, posWeight, source);
    }
  }

  // Phase 2: Sort by combined weight descending
  const sorted = [...accumulator.entries()]
    .map(([ticker, data]) => ({
      ticker,
      weight: data.totalWeight.toNumber(),
      sources: data.sources,
    }))
    .sort((a, b) => b.weight - a.weight);

  // Phase 3: Top-N cutoff with "Other" bucket
  if (sorted.length <= CONCENTRATION_TOP_N) {
    return sorted;
  }

  const topN = sorted.slice(0, CONCENTRATION_TOP_N);
  const otherWeight = sorted
    .slice(CONCENTRATION_TOP_N)
    .reduce((sum, item) => sum + item.weight, 0);

  if (otherWeight > 0) {
    topN.push({
      ticker: "Other",
      weight: otherWeight,
      sources: [{ type: "direct", weight: otherWeight }],
    });
  }

  return topN;
}
