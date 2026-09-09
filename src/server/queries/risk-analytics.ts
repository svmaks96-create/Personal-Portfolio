import { cache } from "react";
import { format, parseISO, subDays } from "date-fns";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { getTickerProfilesMap } from "@/server/queries/ticker-profiles";
import {
  getPriceHistory,
  getEarliestTransactionDate,
} from "@/server/queries/market-data";
import { buildReturnsForWindow } from "@/server/services/correlation";
import {
  buildCommonSample,
  estimateCovariance,
  type CovarianceEstimate,
} from "@/server/services/risk/covariance";
import {
  computeUniverseWeights,
  type UniverseHolding,
  type UniverseWeights,
} from "@/server/services/risk/weights";
import {
  computeRiskContribution,
  type RiskContribution,
} from "@/server/services/risk/risk-contribution";
import {
  computeVolDrag,
  dragPctFromVolPct,
  type VolDrag,
} from "@/server/services/risk/vol-drag";
import {
  computeEffectiveBets,
  type EffectiveBets,
} from "@/server/services/risk/effective-bets";
import {
  clusterByCorrelation,
  matchClusterNames,
  type CorrelationCluster,
} from "@/server/services/risk/clustering";
import { getRiskClusterNames } from "@/server/queries/risk-cluster-names";
import { getCustomScenarios } from "@/server/queries/risk-scenarios";
import {
  replayScenario,
  SEED_SCENARIOS,
  type ScenarioReplay,
} from "@/server/services/risk/scenario-replay";
import { RISK_HISTORY_START } from "@/server/services/risk/constants";
import { stdevSample } from "@/server/services/series-utils";
import { TRADING_DAYS_PER_YEAR } from "@/server/services/risk-metrics";
import {
  riskWindowStartDate,
  type RiskUniverse,
  type RiskWindow,
} from "@/shared/schemas/risk-view";

/**
 * Pipeline for the /risk page: current weights for the chosen universe, the
 * shared covariance estimate over the chosen window, and everything derived
 * from them. Pure read path — every number is computed on request from the
 * ledger and the stored price history; nothing here is cached in the DB.
 *
 * Two volatilities appear side by side deliberately:
 *
 * - `riskContribution.portfolioVolPct` is the *model* vol — the quadratic
 *   form under the shrunk covariance. The decomposition must use it or the
 *   contributions would not sum.
 * - `realizedVolPct` is the empirical vol of a book frozen at current
 *   weights over the same shared sample, no shrinkage. This is the honest
 *   input for the drag arithmetic.
 *
 * If the two disagree materially, the estimation window is too thin to
 * trust; the page shows both rather than picking one.
 *
 * Returns are price returns, not total returns — dividends are not added
 * back. For daily correlation and vol this is noise; it slightly understates
 * dividend payers. Carried as a page caveat rather than silently ignored.
 */

export interface NamedCluster extends CorrelationCluster {
  /** User-assigned label re-attached by member overlap, or null. */
  name: string | null;
}

export interface WhatIfState {
  volPct: number;
  enb: number;
  dragPct: number;
}

export interface WhatIfResult {
  fromTicker: string;
  toTicker: string;
  /** Actual dollars moved (requested amount clamped to the source position). */
  amountUsd: number;
  before: WhatIfState;
  after: WhatIfState;
}

export interface RiskAnalyticsReport {
  universe: RiskUniverse;
  window: RiskWindow;
  weights: UniverseWeights;
  covariance: CovarianceEstimate | null;
  riskContribution: RiskContribution | null;
  effectiveBets: EffectiveBets | null;
  clusters: NamedCluster[];
  whatIf: WhatIfResult | null;
  /** Empirical annualized vol of the current-weight book, pct. */
  realizedVolPct: number | null;
  volDrag: VolDrag | null;
  /** Requested measurement start (inclusive). */
  windowFrom: string;
  /** Last date with price data. */
  valuationAsOf: string | null;
}

function aggregateHoldings(
  positions: ReturnType<typeof fetchPositionInputs>["positions"]
): UniverseHolding[] {
  const profiles = getTickerProfilesMap();
  const byKey = new Map<
    string,
    { ticker: string; instrument: "stock" | "option"; values: (number | null)[] }
  >();

  for (const position of positions) {
    if (position.isClosed) continue;
    const key = `${position.ticker}|${position.instrument}`;
    const entry = byKey.get(key) ?? {
      ticker: position.ticker,
      instrument: position.instrument,
      values: [],
    };
    entry.values.push(position.marketValue);
    byKey.set(key, entry);
  }

  return [...byKey.values()].map((entry) => {
    const priced = entry.values.filter((v): v is number => v !== null);
    return {
      ticker: entry.ticker,
      instrument: entry.instrument,
      isEtf: profiles[entry.ticker]?.isEtf === true,
      // Unpriced only when no account leg could be valued at all.
      marketValueUsd:
        priced.length === 0 ? null : priced.reduce((a, v) => a + v, 0),
    };
  });
}

/**
 * Trim-X-add-Y scenario: move `amountUsd` between two covered names and
 * recompute vol / bets / drag under the shrunk covariance. Model quantities
 * on both sides so the comparison is like-for-like.
 */
function computeWhatIf(
  weights: UniverseWeights,
  covariance: CovarianceEstimate,
  baseline: { volPct: number; enb: number } | null,
  fromTicker: string,
  toTicker: string,
  amountUsd: number
): WhatIfResult | null {
  if (baseline === null) return null;
  if (fromTicker === toTicker || amountUsd <= 0) return null;
  const covered = new Set(covariance.tickers);
  const from = weights.weights.find((w) => w.ticker === fromTicker);
  const to = weights.weights.find((w) => w.ticker === toTicker);
  if (!from || !to || !covered.has(fromTicker) || !covered.has(toTicker)) {
    return null;
  }

  const moved = Math.min(amountUsd, from.marketValueUsd);
  if (moved <= 0) return null;

  const total = weights.weights.reduce((a, w) => a + w.marketValueUsd, 0);
  const scenarioWeights = weights.weights.map((w) => {
    const marketValueUsd =
      w.ticker === fromTicker
        ? w.marketValueUsd - moved
        : w.ticker === toTicker
          ? w.marketValueUsd + moved
          : w.marketValueUsd;
    return {
      ...w,
      marketValueUsd,
      weightPct: total === 0 ? 0 : (marketValueUsd / total) * 100,
    };
  });

  const scenarioContribution = computeRiskContribution(
    scenarioWeights,
    covariance
  );
  const scenarioBets = computeEffectiveBets(covariance, scenarioWeights);
  if (scenarioContribution === null || scenarioBets === null) return null;

  return {
    fromTicker,
    toTicker,
    amountUsd: moved,
    before: {
      volPct: baseline.volPct,
      enb: baseline.enb,
      dragPct: dragPctFromVolPct(baseline.volPct),
    },
    after: {
      volPct: scenarioContribution.portfolioVolPct,
      enb: scenarioBets.enb,
      dragPct: dragPctFromVolPct(scenarioContribution.portfolioVolPct),
    },
  };
}

/** A replay plus the bet count measured inside that window. */
export interface ScenarioResult extends ScenarioReplay {
  /** Effective bets estimated on the window's own returns; null if too thin. */
  windowEnb: number | null;
  windowEnbObservations: number | null;
  /**
   * Effective bets over the trailing year on the *same covered names* at the
   * same weights — the fair baseline for the window number. Comparing the
   * window ENB against the page's headline ENB would confound regime change
   * with coverage change (old windows exclude recently listed names).
   */
  calmEnb: number | null;
}

/** Observation floor for in-window covariance — crash windows are short. */
const SCENARIO_MIN_OBSERVATIONS = 30;

export interface ScenarioAnalyticsReport {
  universe: RiskUniverse;
  scenarios: ScenarioResult[];
  /** Windows that produced no replay at all (no coverable names). */
  unreplayable: { label: string; from: string; to: string }[];
}

export const getScenarioAnalytics = cache(
  (portfolio: string | undefined, universe: RiskUniverse): ScenarioAnalyticsReport => {
    const inputs = fetchPositionInputs(portfolio);
    const holdings = aggregateHoldings(inputs.positions);
    const weights = computeUniverseWeights(holdings, universe);
    const tickers = weights.weights.map((w) => w.ticker);

    const priceHistory = getPriceHistory(
      [...new Set([...tickers, "SPY"])],
      "stock_price",
      RISK_HISTORY_START
    );
    const calendar = (priceHistory["SPY"] ?? []).map((p) => p.date);

    const windows = [...SEED_SCENARIOS, ...getCustomScenarios()];
    const scenarios: ScenarioResult[] = [];
    const unreplayable: ScenarioAnalyticsReport["unreplayable"] = [];

    // Trailing-year window for the calm-regime ENB baseline.
    const latestDate = calendar[calendar.length - 1];
    const calmFrom = latestDate
      ? format(subDays(parseISO(latestDate), 365), "yyyy-MM-dd")
      : undefined;

    for (const window of windows) {
      const replay = replayScenario(weights.weights, priceHistory, window, calendar);
      if (replay === null) {
        unreplayable.push({ label: window.label, from: window.from, to: window.to });
        continue;
      }

      // Bet count inside the stress window: same machinery, window returns.
      const coveredTickers = replay.drivers.length
        ? replay.drivers.map((d) => d.ticker)
        : tickers.filter((t) => !replay.excluded.some((e) => e.ticker === t));
      const windowReturns = buildReturnsForWindow(
        priceHistory,
        coveredTickers,
        calendar,
        window.from,
        window.to
      );
      const windowCovariance = estimateCovariance(
        windowReturns,
        SCENARIO_MIN_OBSERVATIONS
      );
      const windowBets = windowCovariance
        ? computeEffectiveBets(windowCovariance, weights.weights)
        : null;

      // Calm baseline: same covered names, same weights, trailing year.
      let calmBets: EffectiveBets | null = null;
      if (calmFrom !== undefined && latestDate !== undefined) {
        const calmReturns = buildReturnsForWindow(
          priceHistory,
          coveredTickers,
          calendar,
          calmFrom,
          latestDate
        );
        const calmCovariance = estimateCovariance(calmReturns);
        calmBets = calmCovariance
          ? computeEffectiveBets(calmCovariance, weights.weights)
          : null;
      }

      scenarios.push({
        ...replay,
        windowEnb: windowBets?.enb ?? null,
        windowEnbObservations: windowCovariance?.observationCount ?? null,
        calmEnb: calmBets?.enb ?? null,
      });
    }

    return { universe, scenarios, unreplayable };
  }
);

export const getRiskAnalytics = cache(
  (
    portfolio: string | undefined,
    universe: RiskUniverse,
    window: RiskWindow,
    whatIfFrom?: string,
    whatIfTo?: string,
    whatIfAmountUsd?: number
  ): RiskAnalyticsReport => {
    const inputs = fetchPositionInputs(portfolio);
    const holdings = aggregateHoldings(inputs.positions);
    const weights = computeUniverseWeights(holdings, universe);

    const windowFrom =
      riskWindowStartDate(window) ?? getEarliestTransactionDate() ?? "2021-01-01";

    const tickers = weights.weights.map((w) => w.ticker);
    const priceHistory = getPriceHistory(
      [...new Set([...tickers, "SPY"])],
      "stock_price",
      windowFrom
    );

    const calendar = (priceHistory["SPY"] ?? []).map((p) => p.date);
    const valuationAsOf = calendar[calendar.length - 1] ?? null;

    if (tickers.length === 0 || calendar.length === 0) {
      return {
        universe,
        window,
        weights,
        covariance: null,
        riskContribution: null,
        effectiveBets: null,
        clusters: [],
        whatIf: null,
        realizedVolPct: null,
        volDrag: null,
        windowFrom,
        valuationAsOf,
      };
    }

    const returnsByTicker = buildReturnsForWindow(
      priceHistory,
      tickers,
      calendar,
      windowFrom,
      valuationAsOf ?? windowFrom
    );

    const covariance = estimateCovariance(returnsByTicker);
    const riskContribution = covariance
      ? computeRiskContribution(weights.weights, covariance)
      : null;

    // Empirical vol of the current-weight book over the shared sample.
    let realizedVolPct: number | null = null;
    if (covariance) {
      const sample = buildCommonSample(returnsByTicker);
      const inSample = weights.weights.filter((w) =>
        sample.tickers.includes(w.ticker)
      );
      const totalWeight = inSample.reduce((a, w) => a + w.weightPct, 0);
      if (totalWeight > 0 && sample.dates.length > 1) {
        const order = inSample.map((w) => ({
          index: sample.tickers.indexOf(w.ticker),
          weight: w.weightPct / totalWeight,
        }));
        const portfolioReturns = sample.returns.map((row) =>
          order.reduce((a, o) => a + o.weight * row[o.index], 0)
        );
        const daily = stdevSample(portfolioReturns);
        realizedVolPct =
          daily === null ? null : daily * Math.sqrt(TRADING_DAYS_PER_YEAR) * 100;
      }
    }

    const volDrag =
      realizedVolPct === null ? null : computeVolDrag(realizedVolPct);

    const effectiveBets = covariance
      ? computeEffectiveBets(covariance, weights.weights)
      : null;

    let clusters: NamedCluster[] = [];
    if (covariance) {
      const raw = clusterByCorrelation(covariance, weights.weights);
      const names = matchClusterNames(raw, getRiskClusterNames());
      clusters = raw.map((cluster, i) => ({ ...cluster, name: names[i] }));
    }

    const whatIf =
      covariance !== null &&
      riskContribution !== null &&
      effectiveBets !== null &&
      whatIfFrom !== undefined &&
      whatIfTo !== undefined &&
      whatIfAmountUsd !== undefined
        ? computeWhatIf(
            weights,
            covariance,
            { volPct: riskContribution.portfolioVolPct, enb: effectiveBets.enb },
            whatIfFrom,
            whatIfTo,
            whatIfAmountUsd
          )
        : null;

    return {
      universe,
      window,
      weights,
      covariance,
      riskContribution,
      effectiveBets,
      clusters,
      whatIf,
      realizedVolPct,
      volDrag,
      windowFrom,
      valuationAsOf,
    };
  }
);
