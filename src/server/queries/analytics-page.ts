import { cache } from "react";
import { getAnalyticsForPage } from "@/server/queries/behavior-analytics";
import { SLEEVE_ORDER } from "@/server/services/sleeve-map";
import { SAME_DAY_ENTRY_KEY } from "@/server/services/attribution";
import {
  formatCurrencyRounded,
  formatPercent,
  formatPnLRounded,
  formatIRRRounded,
} from "@/lib/formatting";
import { pnlDirection } from "@/lib/pnl";

/**
 * Display-ready view models for the /analytics page.
 *
 * Every number is converted to a `{ value, display }` pair here rather than in
 * a component, matching the rest of the app. Tone is decided here too, so the
 * components stay dumb renderers and the sign conventions live in one place —
 * which matters because several of these read backwards: a *lower* drawdown is
 * worse, and positive exit "regret" means the sale was a mistake.
 */

export type Tone = "pos" | "neg" | "muted" | "warn" | null;

export interface Cell {
  value: number | null;
  display: string;
  tone: Tone;
  /** Masked when the private/demo toggle is on. Dollar amounts only. */
  isPrivate?: boolean;
}

export interface MetricRow {
  label: string;
  cells: Cell[];
  hint?: string;
}

export interface Table {
  columns: string[];
  rows: MetricRow[];
}

function tone(value: number | null): Tone {
  const d = pnlDirection(value);
  return d === "positive" ? "pos" : d === "negative" ? "neg" : null;
}

function cell(value: number | null, display: string, t: Tone = null): Cell {
  return { value, display, tone: t };
}

function pct(value: number | null, signed = false): Cell {
  return cell(value, formatPercent(value), signed ? tone(value) : null);
}

function ratio(value: number | null, signed = false): Cell {
  return cell(
    value,
    value === null ? "N/A" : value.toFixed(2),
    signed ? tone(value) : null
  );
}

function usd(value: number | null, signed = false): Cell {
  return {
    ...cell(
      value,
      signed ? formatPnLRounded(value) : formatCurrencyRounded(value),
      signed ? tone(value) : null
    ),
    isPrivate: true,
  };
}

function count(value: number | null): Cell {
  return cell(value, value === null ? "N/A" : String(Math.round(value)), null);
}

export interface AnalyticsKpi {
  label: string;
  value: string;
  tone: Tone;
  sub: string;
  isPrivate: boolean;
}

export interface DrawdownRow {
  peakDate: string;
  troughDate: string;
  depth: Cell;
  recovery: string;
  daysDown: number;
  daysToRecover: string;
  isOpen: boolean;
}

export interface ContributionBar {
  label: string;
  contributionPct: number;
  display: string;
  weightDisplay: string;
  tone: Tone;
}

export interface CounterfactualRow {
  freezeDate: string;
  positions: number;
  valueAtFreeze: Cell;
  valueToday: Cell;
  frozenReturn: Cell;
  actualReturn: Cell;
  delta: Cell;
}

export interface AnalyticsPageData {
  meta: {
    scope: string;
    inception: string;
    ledgerAsOf: string;
    valuationAsOf: string;
    episodeSummary: string;
  };
  kpis: AnalyticsKpi[];
  riskTable: Table;
  robustWarning: string | null;
  benchmarkTable: Table;
  drawdowns: {
    rows: DrawdownRow[];
    summary: string;
    current: Cell;
  };
  regimeTable: Table;
  contribution: {
    bars: ContributionBar[];
    totalDisplay: string;
    conflictNote: string | null;
  };
  winLoss: AnalyticsKpi[];
  holdingPeriodTable: Table;
  averagingTable: Table;
  turnoverTable: Table;
  counterfactual: {
    rows: CounterfactualRow[];
    alternatives: Table;
  };
  exitTable: Table;
  concentration: {
    metrics: MetricRow[];
    excludedNote: string | null;
  };
  entrySummary: MetricRow[];
  caveats: { severity: "critical" | "high" | "medium"; text: string }[];
}

export const getAnalyticsPageData = cache(
  (portfolio?: string): AnalyticsPageData => {
    const r = getAnalyticsForPage(portfolio);

    const itd = r.performance[0].rows.find((x) => x.label === "Inception to date");
    const risk = r.risk;
    const spyRelation = risk.benchmarkRelations.find((b) => b.symbol === "SPY");

    // ---- KPI strip ----
    const kpis: AnalyticsKpi[] = [
      {
        label: "TWRR ITD",
        value: formatPercent(itd?.portfolioReturnPct ?? null),
        tone: tone(itd?.portfolioReturnPct ?? null),
        sub: `SPY ${formatPercent(itd?.benchmarkReturnPct["SPY"] ?? null)}`,
        isPrivate: false,
      },
      {
        label: "Ann. MWRR",
        value: formatIRRRounded(r.performance[0].xirrPct),
        tone: tone(r.performance[0].xirrPct),
        sub: "Money-weighted",
        isPrivate: false,
      },
      {
        label: "Max Drawdown",
        value: formatPercent(risk.drawdowns.maxDrawdownPct),
        tone: risk.drawdowns.maxDrawdownPct === null ? null : "neg",
        sub: `SPY ${formatPercent(
          risk.benchmarkDrawdowns.find((b) => b.symbol === "SPY")?.analysis
            .maxDrawdownPct ?? null
        )}`,
        isPrivate: false,
      },
      {
        label: "Sharpe",
        value: risk.headline.sharpe === null ? "N/A" : risk.headline.sharpe.toFixed(2),
        tone: tone(risk.headline.sharpe),
        sub: `over ${risk.headline.riskFreeAnnualPct}% cash`,
        isPrivate: false,
      },
      {
        label: "Beta vs SPY",
        value: spyRelation?.beta === null || spyRelation === undefined
          ? "N/A"
          : spyRelation.beta.toFixed(2),
        tone: null,
        sub: `alpha ${formatPercent(spyRelation?.alphaAnnualizedPct ?? null)}`,
        isPrivate: false,
      },
    ];

    // ---- Risk table ----
    const statColumns = ["Portfolio", ...risk.benchmarkStats.map((b) => b.symbol)];
    const statSeries = [risk.headline, ...risk.benchmarkStats.map((b) => b.stats)];
    const statRow = (
      label: string,
      pick: (s: (typeof statSeries)[number]) => Cell
    ): MetricRow => ({ label, cells: statSeries.map(pick) });

    const riskTable: Table = {
      columns: statColumns,
      rows: [
        statRow("Annualized return", (s) => pct(s.annualizedReturnPct, true)),
        statRow("Annualized volatility", (s) => pct(s.annualizedVolPct)),
        statRow("Max drawdown", (s) => pct(s.maxDrawdownPct)),
        statRow("Sharpe", (s) => ratio(s.sharpe, true)),
        statRow("Sortino", (s) => ratio(s.sortino, true)),
        statRow("Calmar", (s) => ratio(s.calmar, true)),
        statRow("Positive days", (s) => pct(s.positiveDaysPct)),
        statRow("Worst day", (s) => pct(s.worstDayPct)),
        statRow("Daily VaR 95", (s) => pct(s.var95Pct)),
        statRow("Daily CVaR 95", (s) => pct(s.cvar95Pct)),
      ],
    };

    const volGap =
      risk.robust.annualizedVolPct !== null && risk.headline.annualizedVolPct !== null
        ? Math.abs(risk.robust.annualizedVolPct - risk.headline.annualizedVolPct)
        : 0;
    const robustWarning =
      volGap > 1
        ? `Excluding ${risk.headline.n - risk.robust.n} extreme day(s) moves volatility to ` +
          `${formatPercent(risk.robust.annualizedVolPct)}. On a book that began at a few ` +
          `thousand dollars, one odd day can dominate — quote neither figure alone.`
        : null;

    const benchmarkTable: Table = {
      columns: ["Beta", "Ann. alpha", "Corr", "R²", "Tracking err", "Info ratio", "Up cap", "Down cap"],
      rows: risk.benchmarkRelations.map((b) => ({
        label: b.symbol,
        cells: [
          ratio(b.beta),
          pct(b.alphaAnnualizedPct, true),
          ratio(b.correlation),
          ratio(b.r2),
          pct(b.trackingErrorPct),
          ratio(b.informationRatio, true),
          pct(b.upCapturePct),
          pct(b.downCapturePct),
        ],
      })),
    };

    // ---- Drawdowns ----
    const drawdownRows: DrawdownRow[] = risk.drawdowns.episodes.slice(0, 6).map((e) => ({
      peakDate: e.peakDate,
      troughDate: e.troughDate,
      depth: cell(e.depthPct, formatPercent(e.depthPct), "neg"),
      recovery: e.recoveryDate ?? "still under water",
      daysDown: e.drawdownDays,
      daysToRecover: e.recoveryDays === null ? "—" : String(e.recoveryDays),
      isOpen: e.recoveryDate === null,
    }));

    const worst = risk.drawdowns.episodes[0];
    const summary = worst
      ? `Deepest: ${formatPercent(worst.depthPct)} from ${worst.peakDate}, ` +
        (worst.recoveryDate
          ? `recovered ${worst.recoveryDate} after ${worst.recoveryDays} days under water.`
          : "not yet recovered.")
      : "No drawdowns recorded.";

    // ---- Regimes ----
    const regimeTable: Table = {
      columns: ["Return", "Ann.", "Vol", "Max DD", "Sharpe", "Beta", "Ann. alpha"],
      rows: risk.regimes.map((slice) => {
        const spy = slice.benchmarks.find((b) => b.symbol === "SPY");
        return {
          label: slice.label,
          cells: [
            pct(slice.portfolio.cumulativeReturnPct, true),
            pct(slice.portfolio.annualizedReturnPct, true),
            pct(slice.portfolio.annualizedVolPct),
            pct(slice.portfolio.maxDrawdownPct),
            ratio(slice.portfolio.sharpe, true),
            ratio(spy?.beta ?? null),
            pct(spy?.alphaAnnualizedPct ?? null, true),
          ],
        };
      }),
    };

    // ---- Contribution ----
    const contrib = r.attribution.contributionBySleeve;
    const order = (key: string) => {
      const i = SLEEVE_ORDER.indexOf(key as never);
      return i === -1 ? SLEEVE_ORDER.length : i;
    };
    const bars: ContributionBar[] = [...contrib.rows]
      .sort((a, b) => order(a.key) - order(b.key))
      .map((row) => ({
        label: row.key === SAME_DAY_ENTRY_KEY ? "Same-day entries" : row.label,
        contributionPct: row.contributionPct,
        display: formatPercent(row.contributionPct),
        weightDisplay: formatPercent(row.avgWeightPct),
        tone: tone(row.contributionPct),
      }));

    const dollarBySleeve = new Map(
      r.attribution.itdBySleeve.rows.map((x) => [x.key, x.pnlUsd])
    );
    const conflicts = contrib.rows.filter((x) => {
      const dollars = dollarBySleeve.get(x.key);
      return (
        dollars !== undefined &&
        Math.abs(dollars) > 100 &&
        Math.sign(dollars) !== Math.sign(x.contributionPct)
      );
    });
    const conflictNote =
      conflicts.length > 0
        ? `${conflicts.length} sleeve(s) made money in dollars but cost return: ` +
          conflicts
            .map(
              (x) =>
                `${x.label} ${formatPnLRounded(dollarBySleeve.get(x.key) ?? null)} / ` +
                `${formatPercent(x.contributionPct)}`
            )
            .join(", ") +
          `. Dollars credit gains whenever they happened; contribution charges a sleeve for ` +
          `the capacity it occupied.`
        : null;

    // ---- Behaviour ----
    const wl = r.behavior.winLoss;
    const winLoss: AnalyticsKpi[] = [
      {
        label: "Closed Round-Trips",
        value: String(wl.n),
        tone: null,
        sub: `${wl.wins}W / ${wl.losses}L`,
        isPrivate: false,
      },
      {
        label: "Win Rate",
        value: formatPercent(wl.winRatePct),
        tone: tone((wl.winRatePct ?? 50) - 50),
        sub: `${formatPercent(wl.winRateByDollarsPct)} by capital`,
        isPrivate: false,
      },
      {
        label: "Avg Win / Loss",
        value: wl.winLossRatio === null ? "N/A" : `${wl.winLossRatio.toFixed(2)}x`,
        tone: null,
        sub: `${formatPercent(wl.avgWinPct)} vs ${formatPercent(wl.avgLossPct)}`,
        isPrivate: false,
      },
      {
        label: "Profit Factor",
        value: wl.profitFactor === null ? "N/A" : `${wl.profitFactor.toFixed(2)}x`,
        tone: tone((wl.profitFactor ?? 1) - 1),
        sub: `Expectancy ${formatPercent(wl.expectancyPct)}`,
        isPrivate: false,
      },
      {
        label: "Realised P&L",
        value: formatPnLRounded(wl.totalPnlUsd),
        tone: tone(wl.totalPnlUsd),
        sub: "Closed episodes",
        isPrivate: true,
      },
    ];

    const hp = r.behavior.holdingPeriod;
    const holdingPeriodTable: Table = {
      columns: ["n", "Median", "Mean", "p25", "p75", "Max"],
      rows: (
        [
          ["All closed", hp.all],
          ["Winners", hp.winners],
          ["Losers", hp.losers],
          ["Still open", hp.openEpisodeAges],
        ] as const
      ).map(([label, d]) => ({
        label,
        cells: [count(d.n), count(d.median), count(d.mean), count(d.p25), count(d.p75), count(d.max)],
      })),
    };

    const averagingTable: Table = {
      columns: ["n", "Win rate", "Mean return", "Total P&L", "Capital"],
      rows: r.behavior.averaging.cohorts.map((c) => ({
        label: c.cohort,
        cells: [
          count(c.n),
          pct(c.winRatePct),
          pct(c.meanReturnPct, true),
          usd(c.totalPnlUsd, true),
          usd(c.totalInvestedUsd),
        ],
      })),
    };

    const turnoverTable: Table = {
      columns: ["Bought", "Sold", "Avg AUM", "Turnover", "Trades", "Days"],
      rows: r.behavior.turnover.map((t) => ({
        label: t.isPartialYear ? `${t.year} (partial)` : String(t.year),
        cells: [
          usd(t.buysExTransferUsd),
          usd(t.sellsExTransferUsd),
          usd(t.avgAumUsd),
          cell(
            t.turnoverRatio,
            t.turnoverRatio === null ? "N/A" : `${t.turnoverRatio.toFixed(2)}x`,
            null
          ),
          count(t.tradeCount),
          count(t.tradeDays),
        ],
      })),
    };

    // ---- Counterfactual ----
    const twrrSeries = r.series.portfolioTwrr;
    const actualSince = (freezeDate: string): number | null => {
      const before = twrrSeries.filter((p) => p.date <= freezeDate);
      if (before.length === 0 || twrrSeries.length === 0) return null;
      const anchor = before[before.length - 1].growthOfDollar;
      if (anchor === 0) return null;
      return (twrrSeries[twrrSeries.length - 1].growthOfDollar / anchor - 1) * 100;
    };

    const counterfactualRows: CounterfactualRow[] = r.counterfactual.frozenBooks.map(
      (f) => {
        const actual = actualSince(f.freezeDate);
        const delta =
          actual === null || f.cumulativeReturnPct === null
            ? null
            : actual - f.cumulativeReturnPct;
        return {
          freezeDate: f.freezeDate,
          positions: f.positions.length,
          valueAtFreeze: usd(f.startValueUsd),
          valueToday: usd(f.endValueUsd),
          frozenReturn: pct(f.cumulativeReturnPct, true),
          actualReturn: pct(actual, true),
          delta: pct(delta, true),
        };
      }
    );

    const alternatives: Table = {
      columns: ["Deposited", "Value today", "TWRR", "Ann.", "XIRR"],
      rows: [
        ...r.counterfactual.depositsOnly.map((d) => ({
          label: d.label,
          cells: [
            usd(d.totalDepositedUsd),
            usd(d.endValueUsd),
            pct(d.cumulativeReturnPct, true),
            pct(d.annualizedReturnPct, true),
            pct(d.xirrPct, true),
          ],
        })),
        ...r.counterfactual.alternativeSchedules
          .filter((s) => s.isModeled)
          .map((s) => ({
            label: s.label,
            hint: s.modelNote ?? undefined,
            cells: [
              usd(s.totalDepositedUsd),
              usd(s.endValueUsd),
              pct(s.cumulativeReturnPct, true),
              pct(s.annualizedReturnPct, true),
              pct(s.xirrPct, true),
            ],
          })),
        {
          label: "Actual portfolio",
          cells: [
            usd(r.attribution.itdBySleeve.total.netInvestedUsd),
            usd(itd?.endNavUsd ?? null),
            pct(itd?.portfolioReturnPct ?? null, true),
            pct(itd?.portfolioAnnualizedPct ?? null, true),
            pct(r.performance[0].xirrPct, true),
          ],
        },
      ],
    };

    // ---- Timing ----
    const exitTable: Table = {
      columns: ["Complete", "Excluded", "Mean excess", "Median excess", "Too early", "Regret"],
      rows: r.timing.exit.byHorizon.map((h) => ({
        label: `+${h.days}d`,
        cells: [
          count(h.nComplete),
          count(h.nIncompleteExcluded),
          // Positive excess means the sale was costly, so the tone inverts.
          cell(
            h.meanExcessPct,
            formatPercent(h.meanExcessPct),
            h.meanExcessPct === null ? null : h.meanExcessPct > 0 ? "neg" : "pos"
          ),
          cell(
            h.medianExcessPct,
            formatPercent(h.medianExcessPct),
            h.medianExcessPct === null ? null : h.medianExcessPct > 0 ? "neg" : "pos"
          ),
          cell(
            h.soldTooEarlyCount,
            `${h.soldTooEarlyCount}/${h.soldTooEarlyCount + h.soldWellCount}`,
            null
          ),
          cell(
            h.totalRegretUsd,
            formatPnLRounded(h.totalRegretUsd),
            h.totalRegretUsd > 0 ? "neg" : "pos"
          ),
        ],
      })),
    };

    const entry = r.timing.entry;
    const entrySummary: MetricRow[] = [
      { label: "Buy dollars above the 50-DMA", cells: [pct(entry.dollarsAbove50dmaPct)] },
      { label: "Buy dollars above the 200-DMA", cells: [pct(entry.dollarsAbove200dmaPct)] },
      { label: "Mean fill vs 200-DMA", cells: [pct(entry.meanPctVs200dma, true)] },
      { label: "Median fill vs 200-DMA", cells: [pct(entry.distributionVs200dma.median, true)] },
      {
        label: "Coverage",
        cells: [
          cell(
            entry.coverage.withSma200,
            `${entry.coverage.withSma200} of ${entry.coverage.n} buys`,
            "muted"
          ),
        ],
      },
    ];

    // ---- Concentration ----
    const conc = r.concentration.stats;
    const concentrationMetrics: MetricRow[] = [
      { label: "Effective number of bets", cells: [ratio(conc.effectiveNumberOfBets)] },
      { label: "Herfindahl index", cells: [ratio(conc.hhi)] },
      { label: "Diversification ratio", cells: [ratio(conc.diversificationRatio)] },
      { label: "Average pairwise correlation", cells: [ratio(conc.avgPairwiseCorrelation)] },
      {
        label: "Most correlated pair",
        cells: [
          cell(
            conc.mostCorrelatedPair?.value ?? null,
            conc.mostCorrelatedPair
              ? `${conc.mostCorrelatedPair.a} / ${conc.mostCorrelatedPair.b} · ${conc.mostCorrelatedPair.value.toFixed(2)}`
              : "N/A",
            null
          ),
        ],
      },
      {
        label: "Least correlated pair",
        cells: [
          cell(
            conc.leastCorrelatedPair?.value ?? null,
            conc.leastCorrelatedPair
              ? `${conc.leastCorrelatedPair.a} / ${conc.leastCorrelatedPair.b} · ${conc.leastCorrelatedPair.value.toFixed(2)}`
              : "N/A",
            null
          ),
        ],
      },
    ];

    const excludedNote =
      r.concentration.matrix.excluded.length > 0
        ? `Excluded for insufficient history: ` +
          r.concentration.matrix.excluded
            .map((e) => `${e.ticker} (${e.observations} obs)`)
            .join(", ") +
          `. The diversification ratio covers ${formatPercent(conc.coveredWeightPct)} of weight.`
        : null;

    return {
      meta: {
        scope: r.meta.scope,
        inception: r.meta.inception,
        ledgerAsOf: r.meta.ledgerAsOf,
        valuationAsOf: r.meta.valuationAsOf,
        episodeSummary: `${r.meta.counts.consolidatedEpisodes} episodes · ${r.meta.counts.closedEpisodes} closed · ${r.meta.counts.openEpisodes} open`,
      },
      kpis,
      riskTable,
      robustWarning,
      benchmarkTable,
      drawdowns: {
        rows: drawdownRows,
        summary,
        current: pct(risk.drawdowns.currentDrawdownPct),
      },
      regimeTable,
      contribution: {
        bars,
        totalDisplay: formatPercent(contrib.totalReturnPct),
        conflictNote,
      },
      winLoss,
      holdingPeriodTable,
      averagingTable,
      turnoverTable,
      counterfactual: { rows: counterfactualRows, alternatives },
      exitTable,
      concentration: { metrics: concentrationMetrics, excludedNote },
      entrySummary,
      caveats: r.caveats.map((c) => ({ severity: c.severity, text: c.text })),
    };
  }
);
