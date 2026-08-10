import type { RiskUniverse } from "@/shared/schemas/risk-view";

/**
 * Current capital weights for a risk universe.
 *
 * The universe split mirrors how the book is run: `stocks` is the picking
 * sleeve, `etfs` the core sleeve, `all` both together. Options are never part
 * of any universe — their marks are manual and often stale — and holdings
 * without a price cannot carry a weight; both exclusions are reported with
 * their dollar size instead of silently vanishing.
 */

export interface UniverseHolding {
  ticker: string;
  instrument: "stock" | "option";
  isEtf: boolean;
  marketValueUsd: number | null;
}

export interface UniverseWeight {
  ticker: string;
  weightPct: number;
  marketValueUsd: number;
}

export interface UniverseWeights {
  universe: RiskUniverse;
  /** Sorted by weight, descending. Percentages sum to 100 within the universe. */
  weights: UniverseWeight[];
  totalMarketValueUsd: number;
  /** Share of the whole priced book (incl. options) this universe covers. */
  shareOfBookPct: number;
  excludedOptionsValueUsd: number;
  unpricedTickers: string[];
}

function inUniverse(holding: UniverseHolding, universe: RiskUniverse): boolean {
  if (holding.instrument !== "stock") return false;
  switch (universe) {
    case "all":
      return true;
    case "stocks":
      return !holding.isEtf;
    case "etfs":
      return holding.isEtf;
  }
}

export function computeUniverseWeights(
  holdings: UniverseHolding[],
  universe: RiskUniverse
): UniverseWeights {
  const unpricedTickers: string[] = [];
  let excludedOptionsValueUsd = 0;
  let bookTotal = 0;
  const members: { ticker: string; marketValueUsd: number }[] = [];

  for (const holding of holdings) {
    if (holding.marketValueUsd === null) {
      unpricedTickers.push(holding.ticker);
      continue;
    }
    bookTotal += holding.marketValueUsd;
    if (holding.instrument === "option") {
      excludedOptionsValueUsd += holding.marketValueUsd;
      continue;
    }
    if (inUniverse(holding, universe)) {
      members.push({
        ticker: holding.ticker,
        marketValueUsd: holding.marketValueUsd,
      });
    }
  }

  const totalMarketValueUsd = members.reduce((a, m) => a + m.marketValueUsd, 0);
  const weights = members
    .map((m) => ({
      ticker: m.ticker,
      marketValueUsd: m.marketValueUsd,
      weightPct:
        totalMarketValueUsd === 0
          ? 0
          : (m.marketValueUsd / totalMarketValueUsd) * 100,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  return {
    universe,
    weights,
    totalMarketValueUsd,
    shareOfBookPct: bookTotal === 0 ? 0 : (totalMarketValueUsd / bookTotal) * 100,
    excludedOptionsValueUsd,
    unpricedTickers: unpricedTickers.sort(),
  };
}
