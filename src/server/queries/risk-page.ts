import { cache } from "react";
import {
  getRiskAnalytics,
  getScenarioAnalytics,
} from "@/server/queries/risk-analytics";
import { getFactorAnalytics } from "@/server/queries/risk-factor-analytics";
import type { Cell, Table, Tone } from "@/server/queries/analytics-page";
import {
  formatCurrencyRounded,
  formatInteger,
  formatPercentDetailed,
} from "@/lib/formatting";
import {
  universeLabel,
  riskWindowLabel,
  type RiskUniverse,
  type RiskWindow,
} from "@/shared/schemas/risk-view";
import { WHAT_IF_ADD_USD } from "@/server/services/risk/risk-contribution";
import { DEFAULT_CLUSTER_CORRELATION_THRESHOLD } from "@/server/services/risk/clustering";
import type { VolDragPoint } from "@/server/services/risk/vol-drag";

/**
 * Display models for the /risk page. Reuses the analytics page's `Cell`/
 * `Table` shapes so the same dumb table renderer serves both pages; every
 * number is formatted and toned here, never in components.
 *
 * Tone convention on this page: warn marks estimation caveats and positions
 * whose risk share runs well ahead of their capital share. Risk that is
 * merely large is not colored — concentration is a decision, not an error.
 */

const RISK_HEAVY_RATIO = 1.5;
const RISK_HEAVY_MIN_WEIGHT_PCT = 2;

export interface RiskMeta {
  universeLabel: string;
  windowLabel: string;
  /** Actual estimation range (common sample), not the requested window. */
  estimationFrom: string | null;
  estimationTo: string | null;
  observations: Cell;
  shrinkage: Cell;
  limitingTicker: string | null;
  /** Share of the whole priced book this universe covers. */
  shareOfBook: Cell;
}

export interface RiskHeadline {
  label: string;
  value: string;
  tone: Tone;
  sub: string;
}

export interface ClusterView {
  /** User label, or null when unnamed / drifted past recognition. */
  name: string | null;
  members: string[];
  weight: Cell;
  internalCorrelation: Cell;
}

export interface WhatIfComparison {
  moved: string;
  rows: Table;
}

export interface RiskPageData {
  meta: RiskMeta;
  headlines: RiskHeadline[];
  contributionTable: Table;
  /** Notes below the contribution table: exclusions, coverage, what-if base. */
  contributionNotes: string[];
  dragReferenceTable: Table;
  dragCurve: VolDragPoint[];
  dragCurrentVolPct: number | null;
  betsLensTable: Table;
  clusters: ClusterView[];
  clusterThreshold: number;
  /** Tickers eligible for the what-if form (covariance-covered). */
  whatIfTickers: string[];
  whatIf: WhatIfComparison | null;
  /** Estimation honesty block shown on the view bar. */
  caveats: string[];
}

function cell(value: number | null, display: string, tone: Tone = null): Cell {
  return { value, display, tone };
}

function pctDetailed(value: number | null): Cell {
  return cell(value, formatPercentDetailed(value));
}

function signedPp(value: number | null, tone: Tone = null): Cell {
  if (value === null) return cell(null, "N/A", tone);
  const formatted = formatPercentDetailed(Math.abs(value));
  return cell(value, `${value >= 0 ? "+" : "-"}${formatted}`, tone);
}

export const getRiskPageData = cache(
  (
    portfolio: string | undefined,
    universe: RiskUniverse,
    window: RiskWindow,
    whatIfFrom?: string,
    whatIfTo?: string,
    whatIfAmountUsd?: number
  ): RiskPageData => {
    const report = getRiskAnalytics(
      portfolio,
      universe,
      window,
      whatIfFrom,
      whatIfTo,
      whatIfAmountUsd
    );
    const {
      weights,
      covariance,
      riskContribution,
      effectiveBets,
      clusters,
      whatIf,
      realizedVolPct,
      volDrag,
    } = report;

    const meta: RiskMeta = {
      universeLabel: universeLabel(universe),
      windowLabel: riskWindowLabel(window),
      estimationFrom: covariance?.windowFrom ?? null,
      estimationTo: covariance?.windowTo ?? null,
      observations: cell(
        covariance?.observationCount ?? null,
        covariance === null
          ? "N/A"
          : `${formatInteger(covariance.observationCount)} shared days`,
        covariance !== null && covariance.observationCount < 120 ? "warn" : "muted"
      ),
      shrinkage: cell(
        covariance?.shrinkageIntensity ?? null,
        covariance === null
          ? "N/A"
          : `δ ${covariance.shrinkageIntensity.toFixed(2)}`,
        "muted"
      ),
      limitingTicker: covariance?.limitingTicker ?? null,
      shareOfBook: cell(
        weights.shareOfBookPct,
        formatPercentDetailed(weights.shareOfBookPct),
        weights.shareOfBookPct < 95 ? "warn" : "muted"
      ),
    };

    const headlines: RiskHeadline[] = [
      {
        label: "Effective bets",
        value: effectiveBets === null ? "N/A" : effectiveBets.enb.toFixed(1),
        tone: null,
        sub:
          effectiveBets === null
            ? "no covariance estimate"
            : `top bet carries ${formatPercentDetailed(effectiveBets.topBetSharePct)} of variance`,
      },
      {
        label: "Portfolio vol (model)",
        value: formatPercentDetailed(riskContribution?.portfolioVolPct ?? null),
        tone: null,
        sub: "shrunk covariance, current weights",
      },
      {
        label: "Portfolio vol (realized)",
        value: formatPercentDetailed(realizedVolPct),
        tone: null,
        sub: "current weights over the window",
      },
      {
        label: "Volatility drag",
        value: formatPercentDetailed(volDrag?.currentDragPct ?? null),
        tone: volDrag !== null && volDrag.currentDragPct > 4 ? "warn" : null,
        sub: "compounding cost per year, ≈ σ²/2",
      },
      {
        label: "Positions covered",
        value:
          riskContribution === null
            ? "N/A"
            : `${riskContribution.rows.length}`,
        tone:
          riskContribution !== null &&
          riskContribution.excludedTickers.length > 0
            ? "warn"
            : null,
        sub:
          riskContribution === null
            ? "no covariance estimate"
            : `${formatPercentDetailed(riskContribution.coveredWeightPct)} of universe weight`,
      },
    ];

    const contributionRows =
      riskContribution?.rows.map((row) => {
        const delta = row.riskContributionPct - row.weightPct;
        const isRiskHeavy =
          row.weightPct >= RISK_HEAVY_MIN_WEIGHT_PCT &&
          row.riskContributionPct > row.weightPct * RISK_HEAVY_RATIO;
        return {
          label: row.ticker,
          cells: [
            pctDetailed(row.weightPct),
            cell(
              row.riskContributionPct,
              formatPercentDetailed(row.riskContributionPct),
              isRiskHeavy ? "warn" : null
            ),
            signedPp(delta, isRiskHeavy ? "warn" : delta < 0 ? "pos" : null),
            pctDetailed(row.standaloneVolPct),
            signedPp(row.addWhatIfVolDeltaPct),
            cell(row.ercWeightPct, formatPercentDetailed(row.ercWeightPct), "muted"),
          ],
        };
      }) ?? [];

    const contributionTable: Table = {
      columns: [
        "Weight",
        "Risk share",
        "Δ risk−weight",
        "Standalone vol",
        `+$${WHAT_IF_ADD_USD / 1000}k → Δvol`,
        "ERC ref",
      ],
      rows: contributionRows,
    };

    const contributionNotes: string[] = [];
    if (riskContribution !== null && riskContribution.excludedTickers.length > 0) {
      contributionNotes.push(
        `Not decomposable (insufficient shared history): ${riskContribution.excludedTickers.join(", ")} — ` +
          `${formatPercentDetailed(100 - riskContribution.coveredWeightPct)} of universe weight. ` +
          `Covered weights are renormalized to 100%.`
      );
    }
    if (weights.excludedOptionsValueUsd > 0) {
      contributionNotes.push(
        `Options (${formatCurrencyRounded(weights.excludedOptionsValueUsd)}) sit outside every universe — marks are manual and often stale.`
      );
    }
    if (weights.unpricedTickers.length > 0) {
      contributionNotes.push(
        `Unpriced holdings excluded: ${weights.unpricedTickers.join(", ")}.`
      );
    }
    contributionNotes.push(
      "ERC ref is the equal-risk-contribution weight — a reference point, not a target."
    );

    const dragReferenceTable: Table = {
      columns: ["Drag", "Saved vs current"],
      rows:
        volDrag?.references.map((ref) => ({
          label: `at ${formatPercentDetailed(ref.volPct)} vol`,
          cells: [
            pctDetailed(ref.dragPct),
            signedPp(ref.savingsPct, ref.savingsPct > 0 ? "pos" : null),
          ],
        })) ?? [],
    };

    const betsLensTable: Table = {
      columns: ["Count", "What it measures"],
      rows:
        effectiveBets === null
          ? []
          : [
              {
                label: "Principal bets",
                cells: [
                  cell(effectiveBets.enb, effectiveBets.enb.toFixed(1)),
                  cell(null, "independent risk directions, weighted", "muted"),
                ],
              },
              {
                label: "Weight-only (1/HHI)",
                cells: [
                  cell(
                    effectiveBets.weightOnlyBets,
                    effectiveBets.weightOnlyBets.toFixed(1)
                  ),
                  cell(null, "if every name were independent", "muted"),
                ],
              },
              {
                label: "Universe dimensionality",
                cells: [
                  cell(
                    effectiveBets.universeEffectiveRank,
                    effectiveBets.universeEffectiveRank.toFixed(1)
                  ),
                  cell(null, "directions the names span, sizing-blind", "muted"),
                ],
              },
            ],
    };

    const clusterViews: ClusterView[] = clusters.map((cluster) => ({
      name: cluster.name,
      members: cluster.members,
      weight: pctDetailed(cluster.totalWeightPct),
      internalCorrelation: cell(
        cluster.avgInternalCorrelation,
        cluster.avgInternalCorrelation === null
          ? "—"
          : `ρ ${cluster.avgInternalCorrelation.toFixed(2)}`,
        cluster.avgInternalCorrelation !== null &&
        cluster.avgInternalCorrelation > 0.7
          ? "warn"
          : "muted"
      ),
    }));

    let whatIfView: WhatIfComparison | null = null;
    if (whatIf !== null) {
      const deltaCell = (
        before: number,
        after: number,
        invertGood: boolean,
        kind: "pct" | "num" = "pct"
      ): Cell => {
        const delta = after - before;
        const tone: Tone =
          Math.abs(delta) < 1e-9
            ? "muted"
            : (invertGood ? delta < 0 : delta > 0)
              ? "pos"
              : "neg";
        if (kind === "num") {
          const sign = delta >= 0 ? "+" : "-";
          return cell(delta, `${sign}${Math.abs(delta).toFixed(2)}`, tone);
        }
        return signedPp(delta, tone);
      };
      whatIfView = {
        moved: `${formatCurrencyRounded(whatIf.amountUsd)} from ${whatIf.fromTicker} → ${whatIf.toTicker}`,
        rows: {
          columns: ["Now", "After", "Δ"],
          rows: [
            {
              label: "Portfolio vol",
              cells: [
                pctDetailed(whatIf.before.volPct),
                pctDetailed(whatIf.after.volPct),
                deltaCell(whatIf.before.volPct, whatIf.after.volPct, true),
              ],
            },
            {
              label: "Effective bets",
              cells: [
                cell(whatIf.before.enb, whatIf.before.enb.toFixed(2)),
                cell(whatIf.after.enb, whatIf.after.enb.toFixed(2)),
                deltaCell(whatIf.before.enb, whatIf.after.enb, false, "num"),
              ],
            },
            {
              label: "Drag cost / yr",
              cells: [
                pctDetailed(whatIf.before.dragPct),
                pctDetailed(whatIf.after.dragPct),
                deltaCell(whatIf.before.dragPct, whatIf.after.dragPct, true),
              ],
            },
          ],
        },
      };
    }

    const caveats: string[] = [];
    if (covariance !== null) {
      caveats.push(
        `Estimated on ${covariance.observationCount} shared trading days` +
          (covariance.limitingTicker !== null
            ? ` (window capped by ${covariance.limitingTicker})`
            : "") +
          `; Ledoit-Wolf shrinkage δ ${covariance.shrinkageIntensity.toFixed(2)} toward ` +
          `avg correlation ${covariance.avgCorrelation.toFixed(2)}.`
      );
      if (covariance.excluded.length > 0) {
        caveats.push(
          `Excluded from estimation: ${covariance.excluded
            .map((e) => `${e.ticker} (${e.observations}d)`)
            .join(", ")}.`
        );
      }
      if (covariance.psdRepaired) {
        caveats.push(
          "Covariance required eigenvalue repair — treat decomposition with suspicion."
        );
      }
    } else {
      caveats.push("No covariance estimate — not enough shared price history in this window.");
    }
    caveats.push(
      "Price returns, not total returns — dividends are not added back; dividend payers are slightly understated."
    );
    caveats.push(
      "Drag savings are an upper bound: trimming positions moves expected return too, and this page has no return model."
    );

    return {
      meta,
      headlines,
      contributionTable,
      contributionNotes,
      dragReferenceTable,
      dragCurve: volDrag?.curve ?? [],
      dragCurrentVolPct: volDrag?.currentVolPct ?? null,
      betsLensTable,
      clusters: clusterViews,
      clusterThreshold: DEFAULT_CLUSTER_CORRELATION_THRESHOLD,
      whatIfTickers: covariance?.tickers ?? [],
      whatIf: whatIfView,
      caveats,
    };
  }
);

export interface FactorPageData {
  available: boolean;
  /** "82.4% of variance replicable for ~10bps" headline. */
  replicable: Cell;
  loadingsTable: Table;
  driftTable: Table;
  alpha: {
    value: Cell;
    ci: string;
    /** The verdict, in words, decided server-side. */
    verdict: string;
    verdictTone: Tone;
  } | null;
  notes: string[];
}

function signedPct(value: number | null, tone: Tone = null): Cell {
  if (value === null) return cell(null, "N/A", tone);
  const formatted = formatPercentDetailed(Math.abs(value));
  return cell(value, `${value >= 0 ? "+" : "-"}${formatted}`, tone);
}

function beta(value: number | null, tone: Tone = null): Cell {
  return cell(value, value === null ? "N/A" : value.toFixed(2), tone);
}

export const getFactorPageData = cache(
  (
    portfolio: string | undefined,
    universe: RiskUniverse,
    window: RiskWindow
  ): FactorPageData => {
    const report = getFactorAnalytics(portfolio, universe, window);
    const model = report.model;

    if (model === null) {
      return {
        available: false,
        replicable: cell(null, "N/A"),
        loadingsTable: { columns: [], rows: [] },
        driftTable: { columns: [], rows: [] },
        alpha: null,
        notes: [
          "Not enough overlapping history between the sleeve and the factor proxies in this window.",
        ],
      };
    }

    const loadingsTable: Table = {
      columns: ["β", "t", "Var share"],
      rows: model.loadings.map((loading) => ({
        label: loading.label,
        cells: [
          beta(loading.beta),
          cell(
            loading.tStat,
            loading.tStat.toFixed(1),
            Math.abs(loading.tStat) < 1.96 ? "muted" : null
          ),
          pctDetailed(loading.varianceSharePct),
        ],
      })),
    };

    const driftTable: Table = {
      columns: ["First half", "Second half", "Δ"],
      rows: model.drift.map((drift) => {
        const delta =
          drift.firstHalfBeta !== null && drift.secondHalfBeta !== null
            ? drift.secondHalfBeta - drift.firstHalfBeta
            : null;
        return {
          label: drift.symbol,
          cells: [
            beta(drift.firstHalfBeta),
            beta(drift.secondHalfBeta),
            cell(
              delta,
              delta === null
                ? "N/A"
                : `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(2)}`,
              delta !== null && Math.abs(delta) > 0.3 ? "warn" : "muted"
            ),
          ],
        };
      }),
    };

    const distinguishable = model.alphaDistinguishable;
    const positive = model.alphaAnnualPct > 0;
    const verdict = distinguishable
      ? positive
        ? "Statistically distinguishable from zero at 95% — evidence of positive selection over this window."
        : "Statistically distinguishable from zero at 95% — and negative: selection subtracted value over this window."
      : "Not statistically distinguishable from zero. With this sample, the honest reading is: no evidence either way about selection skill.";

    return {
      available: true,
      replicable: cell(
        model.r2Pct,
        formatPercentDetailed(model.r2Pct),
        model.r2Pct > 80 ? "warn" : null
      ),
      loadingsTable,
      driftTable,
      alpha: {
        value: cell(
          model.alphaAnnualPct,
          `${model.alphaAnnualPct >= 0 ? "+" : "-"}${formatPercentDetailed(Math.abs(model.alphaAnnualPct))} / yr`,
          distinguishable ? (positive ? "pos" : "neg") : "muted"
        ),
        ci: `95% CI ${signedPct(model.alphaCiLowPct).display} … ${signedPct(model.alphaCiHighPct).display}`,
        verdict,
        verdictTone: distinguishable ? (positive ? "pos" : "neg") : "muted",
      },
      notes: [
        `${model.observations} daily observations, ${model.from} → ${model.to}; Newey-West errors with ${model.neweyWestLags} lags.`,
        `Betas are sequential: SPY first, then SOXX/IGV/TLT each stripped of everything before it — read them as incremental tilts.`,
        ...(report.skippedThinDays > 0
          ? [
              `${report.skippedThinDays} days skipped where the sleeve base was under $1,000.`,
            ]
          : []),
        "Sleeve returns are flow-adjusted and include dividends received; proxy returns are price-only, which slightly flatters alpha vs TLT/SPY.",
      ],
    };
  }
);

export interface ScenarioPageData {
  table: Table;
  /** Top drawdown drivers per scenario, one line each. */
  driverLines: { label: string; text: string }[];
  exclusionNotes: string[];
  customWindows: { key: string; label: string; from: string; to: string }[];
  notes: string[];
}

function month(date: string): string {
  return date.slice(0, 7);
}

export const getScenarioPageData = cache(
  (portfolio: string | undefined, universe: RiskUniverse): ScenarioPageData => {
    const report = getScenarioAnalytics(portfolio, universe);

    const table: Table = {
      columns: [
        "Period",
        "Covered",
        "Max DD",
        "Trough",
        "Recovery",
        "End to end",
        "Bets: window vs calm",
      ],
      rows: report.scenarios.map((scenario) => ({
        label: scenario.label,
        cells: [
          cell(null, `${month(scenario.from)} → ${month(scenario.to)}`, "muted"),
          cell(
            scenario.coveredWeightPct,
            formatPercentDetailed(scenario.coveredWeightPct),
            scenario.coveredWeightPct < 80 ? "warn" : "muted"
          ),
          cell(
            scenario.maxDrawdownPct,
            scenario.maxDrawdownPct === null
              ? "N/A"
              : formatPercentDetailed(scenario.maxDrawdownPct),
            scenario.maxDrawdownPct !== null && scenario.maxDrawdownPct < -20
              ? "neg"
              : null
          ),
          cell(null, scenario.troughDate ?? "N/A", "muted"),
          cell(
            scenario.recoveryDays,
            scenario.recoveryDays === null
              ? "not in window"
              : `${scenario.recoveryDays}d`,
            scenario.recoveryDays === null ? "warn" : null
          ),
          signedPct(
            scenario.totalReturnPct,
            scenario.totalReturnPct >= 0 ? "pos" : "neg"
          ),
          cell(
            scenario.windowEnb,
            scenario.windowEnb === null
              ? "N/A"
              : scenario.calmEnb === null
                ? `${scenario.windowEnb.toFixed(1)} (${scenario.windowEnbObservations}d)`
                : `${scenario.windowEnb.toFixed(1)} vs ${scenario.calmEnb.toFixed(1)} (${scenario.windowEnbObservations}d)`,
            scenario.windowEnbObservations !== null &&
            scenario.windowEnbObservations < 60
              ? "warn"
              : scenario.windowEnb !== null &&
                  scenario.calmEnb !== null &&
                  scenario.windowEnb < 0.8 * scenario.calmEnb
                ? "neg"
                : "muted"
          ),
        ],
      })),
    };

    const driverLines = report.scenarios
      .filter((s) => s.drivers.length > 0 && s.maxDrawdownPct !== null)
      .map((s) => ({
        label: s.label,
        text: s.drivers
          .slice(0, 3)
          .map(
            (d) =>
              `${d.ticker} ${d.contributionPct >= 0 ? "+" : "−"}${Math.abs(d.contributionPct).toFixed(1)}pp`
          )
          .join(" · "),
      }));

    const exclusionNotes = report.scenarios
      .filter((s) => s.excluded.length > 0)
      .map(
        (s) =>
          `${s.label}: excludes ${s.excluded.map((e) => e.ticker).join(", ")} — replay covers ${formatPercentDetailed(s.coveredWeightPct)} of the universe, renormalized.`
      );

    const notes: string[] = [
      "Current weights, bought at each window's first prices and held — weights drift as they would have in reality. Names listed after a window's start are excluded, never proxied.",
      "Bets: window vs calm — the entropy bet count on the window's own correlations vs the trailing year, both over the same covered names at current weights. A window figure well below calm is correlation tightening under stress, not a sizing change; red marks a drop past 20%.",
      ...report.unreplayable.map(
        (u) => `${u.label} (${month(u.from)} → ${month(u.to)}): no coverable names.`
      ),
    ];

    return {
      table,
      driverLines,
      exclusionNotes,
      customWindows: report.scenarios
        .filter((s) => s.isCustom)
        .map((s) => ({ key: s.key, label: s.label, from: s.from, to: s.to })),
      notes,
    };
  }
);
