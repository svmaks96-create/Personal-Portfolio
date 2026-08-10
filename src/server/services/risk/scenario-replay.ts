import { computeDrawdowns, type GrowthPoint } from "@/server/services/risk-metrics";
import { forwardFillPriceDated } from "@/server/services/price-lookup";
import type { MarketDataInput } from "@/server/types/positions";
import type { UniverseWeight } from "@/server/services/risk/weights";

/**
 * Historical scenario replay: the *current* book, frozen as of today, pushed
 * through actual past episodes. Shares are bought at each window's first
 * prices in today's proportions and held — weights drift within the window
 * exactly as they would have in reality.
 *
 * Names that did not exist at a window's start are **excluded and disclosed,
 * never proxied**: estimating a 2025 IPO's factor loadings from a few hundred
 * post-listing days and projecting them into March 2020 manufactures
 * confidence about exactly the names we know least about. Coverage is
 * reported per scenario so a replay over 60% of the book cannot be read as
 * covering all of it.
 */

export interface ScenarioWindow {
  key: string;
  label: string;
  from: string;
  to: string;
  isCustom?: boolean;
}

/**
 * Seeded episodes. Windows deliberately extend past the trough so recovery
 * time is observable; several are still-open wounds at their `to` date and
 * report as unrecovered.
 */
export const SEED_SCENARIOS: readonly ScenarioWindow[] = [
  {
    key: "compression-2022",
    label: "2021–22 multiple compression",
    from: "2021-11-01",
    to: "2023-06-30",
  },
  { key: "covid-2020", label: "COVID crash", from: "2020-02-01", to: "2020-12-31" },
  { key: "q4-2018", label: "Q4 2018 tightening", from: "2018-09-20", to: "2019-04-30" },
  {
    key: "yen-carry-2024",
    label: "Aug 2024 yen carry unwind",
    from: "2024-07-10",
    to: "2024-09-30",
  },
  {
    key: "deepseek-2025",
    label: "Jan 2025 DeepSeek session",
    from: "2025-01-20",
    to: "2025-03-31",
  },
  {
    key: "tariffs-2025",
    label: "Apr 2025 tariffs",
    from: "2025-02-19",
    to: "2025-07-31",
  },
] as const;

/** A name must have a price within this many days after window start. */
const START_GRACE_DAYS_ISO = 7;

export interface ScenarioExclusion {
  ticker: string;
  reason: string;
}

export interface ScenarioDriver {
  ticker: string;
  /** Weight at window start (renormalized over included names), pct. */
  startWeightPct: number;
  /** Own return over the portfolio's peak→trough, pct. */
  peakToTroughReturnPct: number;
  /** Contribution to the portfolio drawdown, pct points. */
  contributionPct: number;
}

export interface ScenarioReplay {
  key: string;
  label: string;
  from: string;
  to: string;
  isCustom: boolean;
  /** Share of current universe weight the replay covers, pct. */
  coveredWeightPct: number;
  excluded: ScenarioExclusion[];
  observations: number;
  /** Start→end total return of the replayed book, pct. */
  totalReturnPct: number;
  maxDrawdownPct: number | null;
  peakDate: string | null;
  troughDate: string | null;
  /** Calendar days trough→recovery; null if unrecovered within the window. */
  recoveryDays: number | null;
  drivers: ScenarioDriver[];
}

function isoAddDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function replayScenario(
  weights: UniverseWeight[],
  priceHistory: Record<string, MarketDataInput[]>,
  window: ScenarioWindow,
  calendar: string[]
): ScenarioReplay | null {
  const dates = calendar.filter((d) => d >= window.from && d <= window.to);
  if (dates.length < 2) return null;
  const startDate = dates[0];
  const graceLimit = isoAddDays(startDate, START_GRACE_DAYS_ISO);

  const excluded: ScenarioExclusion[] = [];
  const included: {
    ticker: string;
    weightPct: number;
    prices: MarketDataInput[];
    startPrice: number;
  }[] = [];

  for (const weight of weights) {
    const prices = [...(priceHistory[weight.ticker] ?? [])].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const first = prices[0]?.date;
    if (first === undefined || first > graceLimit) {
      excluded.push({
        ticker: weight.ticker,
        reason:
          first === undefined
            ? "no price history"
            : `listed ${first}, after this window's start`,
      });
      continue;
    }
    const startQuote = forwardFillPriceDated(prices, startDate);
    if (startQuote === null || startQuote.value <= 0) {
      excluded.push({ ticker: weight.ticker, reason: "no price at window start" });
      continue;
    }
    included.push({
      ticker: weight.ticker,
      weightPct: weight.weightPct,
      prices,
      startPrice: startQuote.value,
    });
  }

  const totalWeight = weights.reduce((a, w) => a + w.weightPct, 0);
  const coveredWeight = included.reduce((a, m) => a + m.weightPct, 0);
  if (included.length === 0 || coveredWeight <= 0) return null;

  // Today's proportions bought at window-start prices, then held.
  const shares = included.map((m) => m.weightPct / coveredWeight / m.startPrice);

  const path: GrowthPoint[] = [];
  const memberValues: number[][] = [];
  for (const date of dates) {
    let value = 0;
    const row: number[] = [];
    for (let i = 0; i < included.length; i++) {
      const quote = forwardFillPriceDated(included[i].prices, date);
      const memberValue = (quote?.value ?? included[i].startPrice) * shares[i];
      row.push(memberValue);
      value += memberValue;
    }
    memberValues.push(row);
    path.push({ date, growthOfDollar: value });
  }

  const drawdowns = computeDrawdowns(path, 1);
  const worst = drawdowns.episodes.reduce<
    (typeof drawdowns.episodes)[number] | null
  >((acc, e) => (acc === null || e.depthPct < acc.depthPct ? e : acc), null);

  let drivers: ScenarioDriver[] = [];
  if (worst !== null) {
    const peakIndex = dates.indexOf(worst.peakDate);
    const troughIndex = dates.indexOf(worst.troughDate);
    if (peakIndex !== -1 && troughIndex !== -1) {
      const peakTotal = path[peakIndex].growthOfDollar;
      drivers = included
        .map((m, i) => {
          const peakValue = memberValues[peakIndex][i];
          const troughValue = memberValues[troughIndex][i];
          return {
            ticker: m.ticker,
            startWeightPct: (m.weightPct / coveredWeight) * 100,
            peakToTroughReturnPct:
              peakValue <= 0 ? 0 : (troughValue / peakValue - 1) * 100,
            contributionPct:
              peakTotal <= 0
                ? 0
                : ((troughValue - peakValue) / peakTotal) * 100,
          };
        })
        .sort((a, b) => a.contributionPct - b.contributionPct);
    }
  }

  const startValue = path[0].growthOfDollar;
  const endValue = path[path.length - 1].growthOfDollar;

  return {
    key: window.key,
    label: window.label,
    from: window.from,
    to: window.to,
    isCustom: window.isCustom === true,
    coveredWeightPct: totalWeight === 0 ? 0 : (coveredWeight / totalWeight) * 100,
    excluded,
    observations: dates.length,
    totalReturnPct: startValue <= 0 ? 0 : (endValue / startValue - 1) * 100,
    maxDrawdownPct: worst?.depthPct ?? null,
    peakDate: worst?.peakDate ?? null,
    troughDate: worst?.troughDate ?? null,
    recoveryDays: worst?.recoveryDays ?? null,
    drivers,
  };
}
