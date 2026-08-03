import Decimal from "decimal.js";
import { sleeveOf, type Sleeve } from "@/server/services/sleeve-map";
import type { DailyHoldingsPoint } from "@/server/services/daily-holdings";

/**
 * Where the money actually came from, over any window.
 *
 * For a holding j over `(t0, t1]`:
 *
 *   PnL_j = [MV_j(t1) − MV_j(t0)] − netInvested_j + dividends_j
 *
 * This is additive by construction — the rows always sum to the portfolio
 * total — and needs no daily contribution series, so it survives every data
 * problem that would corrupt a chain-linked attribution (stale quotes, the
 * option-mark step function, days where market value briefly hits zero).
 * That makes it the number to trust when a fancier decomposition looks odd.
 *
 * It is also inherently transfer-safe. An inter-broker move books a sell in
 * one account and an offsetting buy in the other, so the flows cancel and the
 * market value never changes: contribution ≈ 0, with no special-casing. That
 * is not true of realized-P&L accounting, which shows a large phantom gain on
 * the sending side.
 */

export type AttributionGroupBy =
  | "holding"
  | "ticker"
  | "sleeve"
  | "portfolio"
  | "sector";

export interface AttributionRow {
  key: string;
  label: string;
  sleeve: Sleeve | null;
  startMarketValueUsd: number;
  endMarketValueUsd: number;
  /** Positive = capital added over the window. */
  netInvestedUsd: number;
  dividendsUsd: number;
  pnlUsd: number;
  /**
   * Mean market value over the days this holding actually existed — not over
   * the whole window. Averaging a six-week option position across five years
   * produces a denominator near zero and a return in the thousands of percent.
   */
  avgCapitalUsd: number;
  /** Trading days with non-zero market value inside the window. */
  daysWithExposure: number;
  /** pnl / avgCapital. Null when no capital was deployed. */
  returnOnAvgCapitalPct: number | null;
  /** Share of the window's total P&L. Null when total P&L is ~0. */
  shareOfTotalPct: number | null;
}

export interface AttributionResult {
  from: string;
  to: string;
  rows: AttributionRow[];
  total: {
    startMarketValueUsd: number;
    endMarketValueUsd: number;
    netInvestedUsd: number;
    dividendsUsd: number;
    pnlUsd: number;
    avgCapitalUsd: number;
  };
  /** Rows sum to total within this many dollars. Asserted in tests. */
  residualUsd: number;
}

export interface AttributionOptions {
  groupBy: AttributionGroupBy;
  /** Window opens strictly after the last point before this date. */
  from?: string;
  to?: string;
  /**
   * Required for `groupBy: "sector"`. ETFs are deliberately routed to their own
   * bucket rather than a sector — FMP labels every fund "Financial Services",
   * which would file VTI, BND and VNQ together and make the table meaningless.
   */
  sectorByTicker?: Record<string, string>;
}

interface Bucket {
  key: string;
  label: string;
  sleeve: Sleeve | null;
  start: Decimal;
  end: Decimal;
  invested: Decimal;
  dividends: Decimal;
  mvSum: Decimal;
  exposureDays: number;
}

export function computeAttribution(
  points: DailyHoldingsPoint[],
  options: AttributionOptions
): AttributionResult {
  const { groupBy, from, to } = options;

  const inRange = to === undefined ? points : points.filter((p) => p.date <= to);
  if (inRange.length === 0) return empty(from ?? "", to ?? "");

  // Anchor: the last observation strictly before the window. Its market values
  // are the opening balance, and flows on that date belong to the prior period.
  const anchorIdx = from === undefined ? -1 : lastIndexBefore(inRange, from);
  const anchor = anchorIdx >= 0 ? inRange[anchorIdx] : null;
  const windowPoints = inRange.slice(anchorIdx + 1);
  if (windowPoints.length === 0) return empty(from ?? "", to ?? "");

  const buckets = new Map<string, Bucket>();
  const bucketFor = (
    key: string,
    label: string,
    sleeve: Sleeve | null
  ): Bucket => {
    let b = buckets.get(key);
    if (!b) {
      b = {
        key,
        label,
        sleeve,
        start: new Decimal(0),
        end: new Decimal(0),
        invested: new Decimal(0),
        dividends: new Decimal(0),
        mvSum: new Decimal(0),
        exposureDays: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };

  const identify = makeIdentifier(groupBy, options.sectorByTicker);

  if (anchor) {
    for (const h of anchor.holdings) {
      const { key, label, sleeve } = identify(h);
      const b = bucketFor(key, label, sleeve);
      b.start = b.start.plus(h.marketValueUsd);
    }
  }

  const lastPoint = windowPoints[windowPoints.length - 1];

  for (const point of windowPoints) {
    const isLast = point === lastPoint;
    for (const h of point.holdings) {
      const { key, label, sleeve } = identify(h);
      const b = bucketFor(key, label, sleeve);
      b.invested = b.invested.plus(h.externalFlowUsd);
      b.dividends = b.dividends.plus(h.dividendUsd);
      if (h.marketValueUsd !== 0) {
        b.mvSum = b.mvSum.plus(h.marketValueUsd);
        b.exposureDays += 1;
      }
      if (isLast) b.end = b.end.plus(h.marketValueUsd);
    }
  }

  const n = windowPoints.length;
  const rows: AttributionRow[] = [];
  let totalPnl = new Decimal(0);

  for (const b of buckets.values()) {
    const pnl = b.end.minus(b.start).minus(b.invested).plus(b.dividends);
    totalPnl = totalPnl.plus(pnl);
    const avgCapital =
      b.exposureDays > 0 ? b.mvSum.div(b.exposureDays) : new Decimal(0);
    rows.push({
      key: b.key,
      label: b.label,
      sleeve: b.sleeve,
      startMarketValueUsd: b.start.toNumber(),
      endMarketValueUsd: b.end.toNumber(),
      netInvestedUsd: b.invested.toNumber(),
      dividendsUsd: b.dividends.toNumber(),
      pnlUsd: pnl.toNumber(),
      avgCapitalUsd: avgCapital.toNumber(),
      daysWithExposure: b.exposureDays,
      returnOnAvgCapitalPct: avgCapital.greaterThan(1)
        ? pnl.div(avgCapital).times(100).toNumber()
        : null,
      shareOfTotalPct: null,
    });
  }

  const totalPnlNum = totalPnl.toNumber();
  for (const row of rows) {
    row.shareOfTotalPct =
      Math.abs(totalPnlNum) > 1 ? (row.pnlUsd / totalPnlNum) * 100 : null;
  }
  rows.sort((a, b) => b.pnlUsd - a.pnlUsd);

  const startTotal = anchor?.totalMarketValueUsd ?? 0;
  const endTotal = lastPoint.totalMarketValueUsd;
  let investedTotal = new Decimal(0);
  let dividendTotal = new Decimal(0);
  let mvSumTotal = new Decimal(0);
  for (const p of windowPoints) {
    investedTotal = investedTotal.plus(p.totalExternalFlowUsd);
    dividendTotal = dividendTotal.plus(p.totalDividendUsd);
    mvSumTotal = mvSumTotal.plus(p.totalMarketValueUsd);
  }

  const totalCheck = new Decimal(endTotal)
    .minus(startTotal)
    .minus(investedTotal)
    .plus(dividendTotal);

  return {
    from: windowPoints[0].date,
    to: lastPoint.date,
    rows,
    total: {
      startMarketValueUsd: startTotal,
      endMarketValueUsd: endTotal,
      netInvestedUsd: investedTotal.toNumber(),
      dividendsUsd: dividendTotal.toNumber(),
      pnlUsd: totalCheck.toNumber(),
      avgCapitalUsd: mvSumTotal.div(n).toNumber(),
    },
    residualUsd: totalCheck.minus(totalPnl).toNumber(),
  };
}

/** Bucket for intraday P&L on positions opened that day. */
export const SAME_DAY_ENTRY_KEY = "__same_day_entries__";

export interface ContributionRow {
  key: string;
  label: string;
  sleeve: Sleeve | null;
  /** Cariño-linked contribution, in percentage points of portfolio return. */
  contributionPct: number;
  /** Mean weight across days the holding was actually held. */
  avgWeightPct: number;
  daysWithExposure: number;
}

export interface ContributionResult {
  from: string;
  to: string;
  /** Chain-linked portfolio return over the window. */
  totalReturnPct: number;
  rows: ContributionRow[];
  /** Rows minus total. Asserted to ~0 in tests — the key correctness property. */
  residualPct: number;
  /** Days excluded because the prior-day portfolio was worth under $1. */
  skippedDays: string[];
}

/**
 * Contribution to return, decomposed per holding and linked across time.
 *
 * Daily contribution is `w_j(t) × r_j(t)` where the weight comes from the
 * *prior* day's market value and the return has that day's external flow
 * removed — the same end-of-day convention the TWRR series uses, so a purchase
 * does not register as a gain on the day the cash lands.
 *
 * Multi-period linking uses the Cariño smoothing algorithm rather than naive
 * summation. Daily contributions do not add up across time under compounding,
 * and a table whose columns fail to reconcile with its total is worse than no
 * table — a reader who notices stops trusting everything else. Cariño
 * distributes the compounding residual across periods so the rows sum to the
 * chain-linked total exactly.
 */
export function computeDailyContribution(
  points: DailyHoldingsPoint[],
  options: AttributionOptions
): ContributionResult {
  const { groupBy, from, to } = options;

  const inRange = to === undefined ? points : points.filter((p) => p.date <= to);
  const startIdx = from === undefined ? 0 : Math.max(0, lastIndexBefore(inRange, from));
  const window = inRange.slice(startIdx);

  const empty: ContributionResult = {
    from: from ?? "",
    to: to ?? "",
    totalReturnPct: 0,
    rows: [],
    residualPct: 0,
    skippedDays: [],
  };
  if (window.length < 2) return empty;

  const identify = makeIdentifier(groupBy, options.sectorByTicker);

  // Per-day raw contributions, accumulated per bucket.
  const dailyContribs: Map<string, number>[] = [];
  const portfolioReturns: number[] = [];
  const skippedDays: string[] = [];
  const meta = new Map<string, { label: string; sleeve: Sleeve | null }>();
  const weightSum = new Map<string, number>();
  const weightDays = new Map<string, number>();

  for (let i = 1; i < window.length; i += 1) {
    const prev = window[i - 1];
    const curr = window[i];

    if (prev.totalMarketValueUsd < 1) {
      skippedDays.push(curr.date);
      continue;
    }

    const prevByKey = new Map<string, number>();
    for (const h of prev.holdings) {
      const { key, label, sleeve } = identify(h);
      if (!meta.has(key)) meta.set(key, { label, sleeve });
      prevByKey.set(key, (prevByKey.get(key) ?? 0) + h.marketValueUsd);
    }

    const currByKey = new Map<string, { mv: number; flow: number }>();
    for (const h of curr.holdings) {
      const { key, label, sleeve } = identify(h);
      if (!meta.has(key)) meta.set(key, { label, sleeve });
      const e = currByKey.get(key) ?? { mv: 0, flow: 0 };
      e.mv += h.marketValueUsd;
      e.flow += h.externalFlowUsd;
      currByKey.set(key, e);
    }

    const contribs = new Map<string, number>();
    let dayReturn = 0;

    for (const [key, prevMv] of prevByKey) {
      // A position opened today carries no weight today: capital that arrived
      // at end of day cannot have earned a return during it.
      //
      // The test is strictly "held nothing yesterday", not a dollar floor. A
      // floor would be applied per bucket, and a sleeve clears any floor more
      // often than a single ticker does — so the same portfolio would report a
      // different total return depending on how it was grouped.
      if (prevMv <= 0) continue;
      const weight = prevMv / prev.totalMarketValueUsd;
      const now = currByKey.get(key) ?? { mv: 0, flow: 0 };
      const ret = (now.mv - now.flow) / prevMv - 1;
      const contribution = weight * ret;
      contribs.set(key, contribution);
      dayReturn += contribution;

      weightSum.set(key, (weightSum.get(key) ?? 0) + weight);
      weightDays.set(key, (weightDays.get(key) ?? 0) + 1);
    }

    // A position opened today has market value at the close but cash flow at
    // the fill price. That intraday move is real and sits in the portfolio's
    // return, yet it has no prior-day weight to attach to. Booking it to an
    // explicit bucket keeps the identity `Σ contributions = portfolio return`
    // exact, and keeps it exact at every grain — the alternative is a total
    // that silently shifts depending on how the rows were grouped.
    const trueDayReturn =
      (curr.totalMarketValueUsd - curr.totalExternalFlowUsd) /
        prev.totalMarketValueUsd -
      1;
    const unattributed = trueDayReturn - dayReturn;
    if (Math.abs(unattributed) > 1e-15) {
      contribs.set(
        SAME_DAY_ENTRY_KEY,
        (contribs.get(SAME_DAY_ENTRY_KEY) ?? 0) + unattributed
      );
      if (!meta.has(SAME_DAY_ENTRY_KEY)) {
        meta.set(SAME_DAY_ENTRY_KEY, {
          label: "Same-day entries (intraday move on new positions)",
          sleeve: null,
        });
      }
      dayReturn = trueDayReturn;
    }

    dailyContribs.push(contribs);
    portfolioReturns.push(dayReturn);
  }

  if (portfolioReturns.length === 0) return empty;

  let growth = 1;
  for (const r of portfolioReturns) growth *= 1 + r;
  const totalReturn = growth - 1;

  // Cariño coefficients: k_t per period, K for the whole window.
  const K = totalReturn === 0 ? 1 : Math.log(1 + totalReturn) / totalReturn;
  const linked = new Map<string, number>();

  for (let t = 0; t < dailyContribs.length; t += 1) {
    const rp = portfolioReturns[t];
    const kt = rp === 0 || 1 + rp <= 0 ? 1 : Math.log(1 + rp) / rp;
    const factor = K === 0 ? 1 : kt / K;
    for (const [key, contribution] of dailyContribs[t]) {
      linked.set(key, (linked.get(key) ?? 0) + factor * contribution);
    }
  }

  const rows: ContributionRow[] = [];
  let summed = 0;
  for (const [key, value] of linked) {
    const info = meta.get(key) ?? { label: key, sleeve: null };
    const days = weightDays.get(key) ?? 0;
    summed += value;
    rows.push({
      key,
      label: info.label,
      sleeve: info.sleeve,
      contributionPct: value * 100,
      avgWeightPct: days === 0 ? 0 : ((weightSum.get(key) ?? 0) / days) * 100,
      daysWithExposure: days,
    });
  }
  rows.sort((a, b) => b.contributionPct - a.contributionPct);

  return {
    from: window[0].date,
    to: window[window.length - 1].date,
    totalReturnPct: totalReturn * 100,
    rows,
    residualPct: (totalReturn - summed) * 100,
    skippedDays,
  };
}

interface BucketIdentity {
  key: string;
  label: string;
  sleeve: Sleeve | null;
}

/** Shared bucketing rule so the two attribution passes can never diverge. */
function makeIdentifier(
  groupBy: AttributionGroupBy,
  sectorByTicker?: Record<string, string>
): (h: DailyHoldingsPoint["holdings"][number]) => BucketIdentity {
  return (h) => {
    const sleeve = sleeveOf(h.ticker, h.instrument);
    switch (groupBy) {
      case "holding":
        return { key: h.key, label: `${h.ticker} (${h.portfolio})`, sleeve };
      case "ticker":
        return {
          key: `${h.ticker}|${h.instrument}`,
          label: h.instrument === "option" ? `${h.ticker} (options)` : h.ticker,
          sleeve,
        };
      case "sleeve":
        return { key: sleeve, label: sleeve, sleeve };
      case "portfolio":
        return { key: h.portfolio, label: h.portfolio, sleeve: null };
      case "sector": {
        if (h.instrument === "option") {
          return { key: "Options", label: "Options", sleeve };
        }
        // Funds have no meaningful sector; FMP calls them all Financial
        // Services, which would bucket VTI with BND and VNQ.
        if (sleeve === "Core Index" || sleeve === "Bonds & Cash Proxy" ||
            sleeve === "Income & Defensive" || sleeve === "Passive Satellite") {
          return { key: "Funds & ETFs", label: "Funds & ETFs", sleeve };
        }
        const sector = sectorByTicker?.[h.ticker] ?? "Unclassified";
        return { key: sector, label: sector, sleeve };
      }
    }
  };
}

function lastIndexBefore(points: DailyHoldingsPoint[], date: string): number {
  let best = -1;
  for (let i = 0; i < points.length; i += 1) {
    if (points[i].date < date) best = i;
    else break;
  }
  return best;
}

function empty(from: string, to: string): AttributionResult {
  return {
    from,
    to,
    rows: [],
    total: {
      startMarketValueUsd: 0,
      endMarketValueUsd: 0,
      netInvestedUsd: 0,
      dividendsUsd: 0,
      pnlUsd: 0,
      avgCapitalUsd: 0,
    },
    residualUsd: 0,
  };
}
