import { cache } from "react";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { getTickerProfilesMap } from "@/server/queries/ticker-profiles";
import {
  getPriceHistory,
  getOptionMarkHistory,
  getEarliestTransactionDate,
} from "@/server/queries/market-data";
import { computeDailyHoldings } from "@/server/services/daily-holdings";
import { dailyReturnsFromPrices } from "@/server/services/correlation";
import {
  computeFactorModel,
  FACTOR_SPECS,
  type FactorModel,
} from "@/server/services/risk/factor-model";
import type { DailyReturn } from "@/server/services/risk-metrics";
import {
  riskWindowStartDate,
  type RiskUniverse,
  type RiskWindow,
} from "@/shared/schemas/risk-view";

/**
 * Factor decomposition inputs: the *actual* daily returns of the chosen
 * sleeve — computed from the per-day holdings walk with flows and dividends
 * handled — regressed on the tradeable proxies.
 *
 * This deliberately differs from the /risk covariance path, which freezes
 * current weights: the factor question ("was the return replicable, is there
 * selection left over") is about the book as it was actually held through
 * time, so historical weights matter. Trades in and out of a sleeve are
 * flows from the sleeve's perspective and are stripped from its return.
 *
 * Days where the sleeve base is below a floor are skipped: a $300 sleeve
 * doubling on one fill is ledger noise, not a return observation.
 */

const MIN_SLEEVE_BASE_USD = 1_000;

export interface FactorAnalyticsReport {
  universe: RiskUniverse;
  window: RiskWindow;
  model: FactorModel | null;
  /** Return observations skipped for a sub-floor base. */
  skippedThinDays: number;
  windowFrom: string;
}

function sleeveMembership(
  universe: RiskUniverse
): (ticker: string, instrument: "stock" | "option", isEtf: boolean) => boolean {
  return (ticker, instrument, isEtf) => {
    if (instrument !== "stock") return false;
    switch (universe) {
      case "all":
        return true;
      case "stocks":
        return !isEtf;
      case "etfs":
        return isEtf;
    }
  };
}

export const getFactorAnalytics = cache(
  (
    portfolio: string | undefined,
    universe: RiskUniverse,
    window: RiskWindow
  ): FactorAnalyticsReport => {
    const inputs = fetchPositionInputs(portfolio);
    const profiles = getTickerProfilesMap();
    const earliest = getEarliestTransactionDate();
    const windowFrom =
      riskWindowStartDate(window) ?? earliest ?? "2021-01-01";

    if (earliest === null || inputs.txInputs.length === 0) {
      return { universe, window, model: null, skippedThinDays: 0, windowFrom };
    }

    const tradedTickers = [
      ...new Set(
        inputs.txInputs
          .filter((t) => t.instrument === "stock")
          .map((t) => t.ticker)
      ),
    ];
    const factorSymbols = FACTOR_SPECS.map((f) => f.symbol);
    const priceHistory = getPriceHistory(
      [...new Set([...tradedTickers, ...factorSymbols, "SPY"])],
      "stock_price",
      earliest
    );

    const calendar = (priceHistory["SPY"] ?? []).map((p) => p.date);
    const endDate = calendar[calendar.length - 1];
    if (!endDate) {
      return { universe, window, model: null, skippedThinDays: 0, windowFrom };
    }

    const points = computeDailyHoldings({
      transactions: inputs.txInputs,
      priceHistory,
      fxHistory: inputs.fxRates,
      optionMarkHistory: getOptionMarkHistory(),
      tradingCalendar: calendar,
      endDate,
    });

    const isMember = sleeveMembership(universe);
    const sleeveReturns: DailyReturn[] = [];
    let skippedThinDays = 0;
    let prevValue: number | null = null;

    for (const point of points) {
      let value = 0;
      let flow = 0;
      let dividends = 0;
      for (const holding of point.holdings) {
        const isEtf = profiles[holding.ticker]?.isEtf === true;
        if (!isMember(holding.ticker, holding.instrument, isEtf)) continue;
        value += holding.marketValueUsd;
        flow += holding.externalFlowUsd;
        dividends += holding.dividendUsd;
      }

      if (prevValue !== null && point.date >= windowFrom) {
        if (prevValue >= MIN_SLEEVE_BASE_USD) {
          sleeveReturns.push({
            date: point.date,
            ret: (value + dividends - flow) / prevValue - 1,
          });
        } else if (value > 0 || prevValue > 0) {
          skippedThinDays++;
        }
      }
      prevValue = value;
    }

    const factorReturns: Record<string, DailyReturn[]> = {};
    for (const symbol of factorSymbols) {
      factorReturns[symbol] = dailyReturnsFromPrices(
        priceHistory[symbol] ?? [],
        windowFrom,
        endDate
      );
    }

    return {
      universe,
      window,
      model: computeFactorModel(sleeveReturns, factorReturns),
      skippedThinDays,
      windowFrom,
    };
  }
);
