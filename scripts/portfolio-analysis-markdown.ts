import {
  formatCurrencyRounded,
  formatPercent,
  formatPnLRounded,
  formatInteger,
} from "../src/lib/formatting";
import { SLEEVE_ORDER } from "../src/server/services/sleeve-map";
import type { BehaviorAnalyticsReport } from "../src/server/queries/behavior-analytics";
import type { AttributionResult } from "../src/server/services/attribution";
import type { WinLossStats } from "../src/server/services/trade-analytics";

/** Renders the analytics report as a standalone markdown document. */
export function renderMarkdown(r: BehaviorAnalyticsReport): string {
  const out: string[] = [];
  const w = (line = "") => out.push(line);

  w(`# Portfolio Behaviour & Counterfactual Analysis`);
  w();
  w(
    `**Scope** ${r.meta.scope} · **Ledger** ${r.meta.inception} → ${r.meta.ledgerAsOf} · ` +
      `**Valued at** ${r.meta.valuationAsOf} · **Generated** ${r.meta.generatedAt.slice(0, 10)}`
  );
  w();
  w(
    `${formatInteger(r.meta.counts.transactions)} transactions · ` +
      `${r.meta.counts.tickers} tickers · ` +
      `${r.meta.counts.consolidatedEpisodes} episodes ` +
      `(${r.meta.counts.closedEpisodes} closed, ${r.meta.counts.openEpisodes} open)`
  );
  w();

  renderCaveats(r, w);
  renderSummary(r, w);
  renderPerformance(r, w);
  renderRisk(r, w);
  renderCounterfactual(r, w);
  renderAttribution(r, w);
  renderConcentration(r, w);
  renderBehaviour(r, w);
  renderTiming(r, w);
  renderEpisodes(r, w);
  renderTransfers(r, w);
  renderDataQuality(r, w);

  return out.join("\n");
}

type Writer = (line?: string) => void;

function renderCaveats(r: BehaviorAnalyticsReport, w: Writer): void {
  w(`## Read this first`);
  w();
  w(
    `These caveats are not boilerplate — two of them are large enough to change ` +
      `what the headline numbers mean.`
  );
  w();
  for (const c of r.caveats) {
    const tag = c.severity === "critical" ? "**CRITICAL**" : c.severity === "high" ? "**HIGH**" : "MEDIUM";
    w(`- ${tag} — ${c.text}`);
  }
  w();
}

function renderSummary(r: BehaviorAnalyticsReport, w: Writer): void {
  const combined = r.performance[0];
  const itd = combined.rows.find((x) => x.label === "Inception to date");
  const pre = combined.rows.find((x) => x.label === "Pre-pivot (to 2024)");
  const post = combined.rows.find((x) => x.label === "Post-pivot (2025+)");
  const primary = r.counterfactual.frozenBooks.find(
    (f) => f.freezeDate === r.counterfactual.primaryFreezeDate
  );
  const itdAttr = r.attribution.itdBySleeve;

  w(`## Executive summary`);
  w();
  w(`| Measure | Value |`);
  w(`| --- | --- |`);
  w(`| Portfolio value today | ${formatCurrencyRounded(itd?.endNavUsd ?? null)} |`);
  w(`| Net capital committed | ${formatCurrencyRounded(itdAttr.total.netInvestedUsd)} |`);
  w(`| Lifetime P&L | ${formatPnLRounded(itdAttr.total.pnlUsd)} |`);
  w(`| Money-weighted return (XIRR) | ${formatPercent(combined.xirrPct)} |`);
  w(`| Time-weighted return, ITD | ${formatPercent(itd?.portfolioReturnPct ?? null)} |`);
  w(`| SPY over the same window | ${formatPercent(itd?.benchmarkReturnPct["SPY"] ?? null)} |`);
  w(`| Pre-pivot TWRR (to 2024-12-31) | ${formatPercent(pre?.portfolioReturnPct ?? null)} (SPY ${formatPercent(pre?.benchmarkReturnPct["SPY"] ?? null)}) |`);
  w(`| Post-pivot TWRR (2025+) | ${formatPercent(post?.portfolioReturnPct ?? null)} (SPY ${formatPercent(post?.benchmarkReturnPct["SPY"] ?? null)}) |`);
  if (primary) {
    w(`| Frozen ${primary.freezeDate} book, held to today | ${formatPercent(primary.cumulativeReturnPct)} |`);
  }
  w(`| Closed round-trips | ${r.behavior.winLoss.n} (${r.behavior.winLoss.wins}W / ${r.behavior.winLoss.losses}L) |`);
  w(`| Win rate | ${formatPercent(r.behavior.winLoss.winRatePct)} |`);
  w(`| Profit factor | ${fmtRatio(r.behavior.winLoss.profitFactor)} |`);
  w();
  w(
    `The ITD time-weighted figure and the money-weighted figure disagree sharply, and ` +
      `both are correct. TWRR weights every year equally; the bad early years ran on a ` +
      `few thousand dollars while the good recent ones ran on a six-figure book. The ` +
      `average-NAV column in the performance table is what reconciles them.`
  );
  w();
}

function renderPerformance(r: BehaviorAnalyticsReport, w: Writer): void {
  w(`## Performance by period`);
  w();
  for (const scope of r.performance) {
    w(`### ${scope.scope}`);
    w();
    w(`Inception ${scope.inception} · money-weighted XIRR ${formatPercent(scope.xirrPct)}`);
    w();
    w(`| Period | Portfolio | SPY | QQQ | VTI | vs SPY | Ann. | Avg NAV | End NAV |`);
    w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
    for (const row of scope.rows) {
      w(
        `| ${row.label} | ${formatPercent(row.portfolioReturnPct)} | ` +
          `${formatPercent(row.benchmarkReturnPct["SPY"] ?? null)} | ` +
          `${formatPercent(row.benchmarkReturnPct["QQQ"] ?? null)} | ` +
          `${formatPercent(row.benchmarkReturnPct["VTI"] ?? null)} | ` +
          `${formatPercent(row.excessVsSpyPct)} | ` +
          `${formatPercent(row.portfolioAnnualizedPct)} | ` +
          `${formatCurrencyRounded(row.avgNavUsd)} | ${formatCurrencyRounded(row.endNavUsd)} |`
      );
    }
    w();
  }
}

function renderRisk(r: BehaviorAnalyticsReport, w: Writer): void {
  const risk = r.risk;
  const h = risk.headline;

  w(`## Risk`);
  w();
  w(
    `Ratios are excess over ${h.riskFreeAnnualPct}% cash — an assumption, not a measurement, ` +
      `since the database holds no rate data.`
  );
  w();
  w(`| Measure | Portfolio | ${risk.benchmarkStats.map((b) => b.symbol).join(" | ")} |`);
  w(`| --- | ---: | ${risk.benchmarkStats.map(() => "---:").join(" | ")} |`);
  const statRow = (label: string, pick: (s: typeof h) => string) =>
    w(
      `| ${label} | ${pick(h)} | ` +
        risk.benchmarkStats.map((b) => pick(b.stats)).join(" | ") +
        ` |`
    );
  statRow("Annualized return", (s) => formatPercent(s.annualizedReturnPct));
  statRow("Annualized volatility", (s) => formatPercent(s.annualizedVolPct));
  statRow("Max drawdown", (s) => formatPercent(s.maxDrawdownPct));
  statRow("Sharpe", (s) => fmtRatio2(s.sharpe));
  statRow("Sortino", (s) => fmtRatio2(s.sortino));
  statRow("Calmar", (s) => fmtRatio2(s.calmar));
  statRow("Best day", (s) => formatPercent(s.bestDayPct));
  statRow("Worst day", (s) => formatPercent(s.worstDayPct));
  statRow("Positive days", (s) => formatPercent(s.positiveDaysPct));
  statRow("Daily VaR 95", (s) => formatPercent(s.var95Pct));
  statRow("Daily CVaR 95", (s) => formatPercent(s.cvar95Pct));
  statRow("Skew", (s) => fmtRatio2(s.skewness));
  statRow("Excess kurtosis", (s) => fmtRatio2(s.excessKurtosis));
  w();

  if (
    risk.robust.annualizedVolPct !== null &&
    h.annualizedVolPct !== null &&
    Math.abs(risk.robust.annualizedVolPct - h.annualizedVolPct) > 1
  ) {
    w(
      `**The headline volatility is not robust.** Excluding daily moves beyond ±25% ` +
        `(${h.n - risk.robust.n} day(s)) changes annualized volatility from ` +
        `${formatPercent(h.annualizedVolPct)} to ${formatPercent(risk.robust.annualizedVolPct)}. ` +
        `On a book that began at a few thousand dollars a single odd day can dominate; ` +
        `neither figure should be quoted without the other.`
    );
    w();
  }

  w(`### Relationship to the benchmarks`);
  w();
  w(`| Benchmark | Beta | Ann. alpha | Correlation | R² | Tracking error | Info ratio | Up capture | Down capture |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const b of risk.benchmarkRelations) {
    w(
      `| ${b.symbol} | ${fmtRatio2(b.beta)} | ${formatPercent(b.alphaAnnualizedPct)} | ` +
        `${fmtRatio2(b.correlation)} | ${fmtRatio2(b.r2)} | ${formatPercent(b.trackingErrorPct)} | ` +
        `${fmtRatio2(b.informationRatio)} | ${formatPercent(b.upCapturePct)} | ` +
        `${formatPercent(b.downCapturePct)} |`
    );
  }
  w();

  w(`### Deepest drawdowns`);
  w();
  w(
    `SPY's own drawdowns are shown alongside so "was that just the market?" is answerable ` +
      `rather than assumed.`
  );
  w();
  w(`| Peak | Trough | Depth | Recovered | Days down | Days to recover |`);
  w(`| --- | --- | ---: | --- | ---: | ---: |`);
  for (const e of risk.drawdowns.episodes.slice(0, 8)) {
    w(
      `| ${e.peakDate} | ${e.troughDate} | ${formatPercent(e.depthPct)} | ` +
        `${e.recoveryDate ?? "**still under water**"} | ${e.drawdownDays} | ` +
        `${e.recoveryDays === null ? "—" : e.recoveryDays} |`
    );
  }
  w();
  const spyDd = risk.benchmarkDrawdowns.find((b) => b.symbol === "SPY");
  w(
    `Portfolio max drawdown ${formatPercent(risk.drawdowns.maxDrawdownPct)} vs SPY ` +
      `${formatPercent(spyDd?.analysis.maxDrawdownPct ?? null)}. Current drawdown ` +
      `${formatPercent(risk.drawdowns.currentDrawdownPct)}.`
  );
  w();

  w(`### By regime`);
  w();
  w(`| Regime | Return | Ann. | Volatility | Max DD | Sharpe | Beta vs SPY | Ann. alpha |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const slice of risk.regimes) {
    const spy = slice.benchmarks.find((b) => b.symbol === "SPY");
    w(
      `| ${slice.label} | ${formatPercent(slice.portfolio.cumulativeReturnPct)} | ` +
        `${formatPercent(slice.portfolio.annualizedReturnPct)} | ` +
        `${formatPercent(slice.portfolio.annualizedVolPct)} | ` +
        `${formatPercent(slice.portfolio.maxDrawdownPct)} | ` +
        `${fmtRatio2(slice.portfolio.sharpe)} | ${fmtRatio2(spy?.beta ?? null)} | ` +
        `${formatPercent(spy?.alphaAnnualizedPct ?? null)} |`
    );
  }
  w();

  if (risk.anomalousDays.length > 0) {
    w(
      `Days with a move beyond ±10%: ${risk.anomalousDays.length}. ` +
        risk.anomalousDays
          .slice(0, 8)
          .map((d) => `${d.date} ${formatPercent(d.retPct)}`)
          .join(", ") +
        (risk.anomalousDays.length > 8 ? ", …" : "") +
        `.`
    );
    w();
  }
}

function renderConcentration(r: BehaviorAnalyticsReport, w: Writer): void {
  const c = r.concentration;
  w(`## Concentration and correlation`);
  w();
  w(
    `Correlation window: ${c.windowDays} trading days ending ${c.matrix.windowTo ?? "—"}. ` +
      `A pair needs ${c.matrix.minOverlapDays} shared observations to produce a number.`
  );
  w();
  w(`| Measure | Value |`);
  w(`| --- | ---: |`);
  w(`| Herfindahl index | ${fmtRatio2(c.stats.hhi)} |`);
  w(`| Effective number of bets | ${fmtRatio2(c.stats.effectiveNumberOfBets)} |`);
  w(`| Diversification ratio | ${fmtRatio2(c.stats.diversificationRatio)} |`);
  w(`| — computed over | ${formatPercent(c.stats.coveredWeightPct)} of portfolio weight |`);
  w(`| Average pairwise correlation | ${fmtRatio2(c.stats.avgPairwiseCorrelation)} |`);
  if (c.stats.mostCorrelatedPair) {
    const p = c.stats.mostCorrelatedPair;
    w(`| Most correlated pair | ${p.a} / ${p.b} at ${fmtRatio2(p.value)} |`);
  }
  if (c.stats.leastCorrelatedPair) {
    const p = c.stats.leastCorrelatedPair;
    w(`| Least correlated pair | ${p.a} / ${p.b} at ${fmtRatio2(p.value)} |`);
  }
  w();

  if (c.matrix.excluded.length > 0) {
    w(
      `Excluded for insufficient history: ` +
        c.matrix.excluded.map((e) => `${e.ticker} (${e.observations} obs)`).join(", ") +
        `.`
    );
    w();
  }
  if (c.stats.excludedFromRatio.length > 0) {
    w(
      `Dropped from the diversification ratio: ${c.stats.excludedFromRatio.join(", ")}. ` +
        `The remaining weights are renormalized, so the ratio describes ` +
        `${formatPercent(c.stats.coveredWeightPct)} of the book rather than all of it.`
    );
    w();
  }
}

function renderTiming(r: BehaviorAnalyticsReport, w: Writer): void {
  const entry = r.timing.entry;
  const exit = r.timing.exit;

  w(`## Timing`);
  w();
  w(`### Entry quality`);
  w();
  w(
    `Measured on the actual fill price, against each name's own moving averages. ` +
      `Coverage: ${entry.coverage.withSma200} of ${entry.coverage.n} buys have 200 days of ` +
      `prior history, ${entry.coverage.withSma50} have 50.`
  );
  w();
  w(`| Measure | Value |`);
  w(`| --- | ---: |`);
  w(`| Buy dollars above the 50-DMA | ${formatPercent(entry.dollarsAbove50dmaPct)} |`);
  w(`| Buy dollars above the 200-DMA | ${formatPercent(entry.dollarsAbove200dmaPct)} |`);
  w(`| Mean fill vs 50-DMA | ${formatPercent(entry.meanPctVs50dma)} |`);
  w(`| Mean fill vs 200-DMA | ${formatPercent(entry.meanPctVs200dma)} |`);
  w(`| Median fill vs 200-DMA | ${formatPercent(entry.distributionVs200dma.median)} |`);
  w();
  w(`| Entry cohort | n buys | Dollars | Win rate | Mean episode return |`);
  w(`| --- | ---: | ---: | ---: | ---: |`);
  for (const cut of entry.outcomeCuts) {
    w(
      `| ${cut.label} | ${cut.n} | ${formatCurrencyRounded(cut.dollarsUsd)} | ` +
        `${formatPercent(cut.winRatePct)} | ${formatPercent(cut.meanEpisodeReturnPct)} |`
    );
  }
  w();
  w(
    `**These cohorts are descriptive, not evidence.** The unit here is a buy, not a round-trip: ` +
      `every buy inherits the outcome of the episode it sits in, so an episode with ten buys ` +
      `contributes ten rows. Positions that are working get added to more often, which ` +
      `mechanically lifts the win rate of whichever cohort holds the most adds. Do not read ` +
      `these numbers as showing that one entry style beats another.`
  );
  w();

  w(`### Exit regret — what happened after selling`);
  w();
  w(
    `Measured against SPY, because the alternative to holding a stock is usually owning the ` +
      `index rather than sitting in cash. Positive excess means the sale was costly. ` +
      `**Horizons that run past the last available price are excluded, never truncated.**`
  );
  w();
  w(`| Horizon | Complete | Excluded | Mean fwd return | Mean SPY | Mean excess | Median excess | Sold too early | Total regret |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const h of exit.byHorizon) {
    w(
      `| +${h.days}d | ${h.nComplete} | ${h.nIncompleteExcluded} | ` +
        `${formatPercent(h.meanForwardReturnPct)} | ${formatPercent(h.meanBenchmarkReturnPct)} | ` +
        `${formatPercent(h.meanExcessPct)} | ${formatPercent(h.medianExcessPct)} | ` +
        `${h.soldTooEarlyCount}/${h.soldTooEarlyCount + h.soldWellCount} | ` +
        `${formatPnLRounded(h.totalRegretUsd)} |`
    );
  }
  w();
  w(`| Exit type | Horizon | n | Mean excess vs SPY |`);
  w(`| --- | ---: | ---: | ---: |`);
  for (const b of exit.byExitType) {
    w(`| ${b.exitType} | +${b.days}d | ${b.n} | ${formatPercent(b.meanExcessPct)} |`);
  }
  w();

  const cl = r.timing.clustering;
  w(`### Do trades cluster into dips or into rallies?`);
  w();
  w(`Bucketed by dollars, not trade count — a scatter of small orders should not outweigh one large purchase.`);
  w();
  w(`| Portfolio state when trading | Trades | Buy $ | Share of buy $ | Sell $ | Share of sell $ |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: |`);
  for (const b of cl.byDrawdownState) {
    w(
      `| ${b.label} | ${b.tradeCount} | ${formatCurrencyRounded(b.buyUsd)} | ` +
        `${formatPercent(b.shareOfBuyDollarsPct)} | ${formatCurrencyRounded(b.sellUsd)} | ` +
        `${formatPercent(b.shareOfSellDollarsPct)} |`
    );
  }
  w();
  w(`| Benchmark's prior 20 days | Trades | Buy $ | Share of buy $ | Sell $ | Share of sell $ |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: |`);
  for (const b of cl.byBenchmarkMomentum) {
    w(
      `| ${b.label} | ${b.tradeCount} | ${formatCurrencyRounded(b.buyUsd)} | ` +
        `${formatPercent(b.shareOfBuyDollarsPct)} | ${formatCurrencyRounded(b.sellUsd)} | ` +
        `${formatPercent(b.shareOfSellDollarsPct)} |`
    );
  }
  w();
  w(`Biggest trade days (transfers excluded):`);
  w();
  w(`| Date | Gross | Trades | Portfolio drawdown that day |`);
  w(`| --- | ---: | ---: | ---: |`);
  for (const d of cl.topTradeDays) {
    w(
      `| ${d.date} | ${formatCurrencyRounded(d.grossUsd)} | ${d.tradeCount} | ` +
        `${formatPercent(d.portfolioDrawdownPct)} |`
    );
  }
  w();
}

function renderCounterfactual(r: BehaviorAnalyticsReport, w: Writer): void {
  w(`## Counterfactuals`);
  w();
  w(`### If trading had stopped on a given date`);
  w();
  w(
    `Positions held on the freeze date, carried forward with no further trades. ` +
      `Compared on time-weighted return because the real portfolio received large ` +
      `contributions afterwards and a frozen book receives none — TWRR is ` +
      `contribution-insensitive, so no contribution policy has to be invented.`
  );
  w();
  w(`| Freeze date | Positions | Value at freeze | Value today | Frozen return | Actual return over same window | Verdict |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | --- |`);
  const combined = r.performance[0];
  for (const f of r.counterfactual.frozenBooks) {
    const actual = actualReturnSince(r, f.freezeDate);
    const verdict =
      f.cumulativeReturnPct === null || actual === null
        ? "—"
        : actual > f.cumulativeReturnPct
          ? `Trading added ${formatPercent(actual - f.cumulativeReturnPct)}`
          : `Trading cost ${formatPercent(f.cumulativeReturnPct - actual)}`;
    w(
      `| ${f.freezeDate} | ${f.positions.length} | ${formatCurrencyRounded(f.startValueUsd)} | ` +
        `${formatCurrencyRounded(f.endValueUsd)} | ${formatPercent(f.cumulativeReturnPct)} | ` +
        `${formatPercent(actual)} | ${verdict} |`
    );
  }
  w();
  void combined;

  const primary = r.counterfactual.frozenBooks.find(
    (f) => f.freezeDate === r.counterfactual.primaryFreezeDate
  );
  if (primary) {
    w(
      `Caveats specific to the ${primary.freezeDate} frozen book: ` +
        `${formatPercent(primary.deadSeriesShareOfEndPct)} of its terminal value is priced ` +
        `off a series that stopped updating (those names were sold at real prices in the ` +
        `actual book, so only the frozen side has the problem), and ` +
        `${formatCurrencyRounded(primary.excludedOptionBasisUsd)} of option basis is excluded ` +
        `because options cannot be carried forward without marks.`
    );
    w();
  }

  w(`### If every dollar had gone into an index instead`);
  w();
  w(
    `Deposit schedule taken from the high-water mark of cumulative net invested, so it ` +
      `only ever adds. A raw daily flow schedule would take the benchmark to cash ` +
      `alongside the investor, which tests timing rather than "just buy the index".`
  );
  w();
  w(`| Alternative | Deposited | Value today | TWRR | Ann. | XIRR |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: |`);
  for (const d of r.counterfactual.depositsOnly) {
    w(
      `| All-in ${d.symbol} | ${formatCurrencyRounded(d.totalDepositedUsd)} | ` +
        `${formatCurrencyRounded(d.endValueUsd)} | ${formatPercent(d.cumulativeReturnPct)} | ` +
        `${formatPercent(d.annualizedReturnPct)} | ${formatPercent(d.xirrPct)} |`
    );
  }
  const itd = r.performance[0].rows.find((x) => x.label === "Inception to date");
  w(
    `| **Actual portfolio** | ${formatCurrencyRounded(r.attribution.itdBySleeve.total.netInvestedUsd)} | ` +
      `${formatCurrencyRounded(itd?.endNavUsd ?? null)} | ${formatPercent(itd?.portfolioReturnPct ?? null)} | ` +
      `${formatPercent(itd?.portfolioAnnualizedPct ?? null)} | ${formatPercent(r.performance[0].xirrPct)} |`
  );
  w();

  if (r.counterfactual.alternativeSchedules.length > 0) {
    w(`### Sensitivity to the contribution schedule`);
    w();
    w(
      `The schedules answer different questions. \`raw-daily\` and \`monthly-netted\` follow the ` +
        `investor into cash whenever they went, so they hold timing constant and test security ` +
        `selection alone. \`deposits-only\` stays invested throughout and so tests selection and ` +
        `timing together.`
    );
    w();
    w(`| Alternative | Schedule | Deposited | Value today | TWRR | Ann. | XIRR |`);
    w(`| --- | --- | ---: | ---: | ---: | ---: | ---: |`);
    for (const s of r.counterfactual.alternativeSchedules) {
      w(
        `| ${s.label} | ${s.schedule} | ${formatCurrencyRounded(s.totalDepositedUsd)} | ` +
          `${formatCurrencyRounded(s.endValueUsd)} | ${formatPercent(s.cumulativeReturnPct)} | ` +
          `${formatPercent(s.annualizedReturnPct)} | ${formatPercent(s.xirrPct)} |`
      );
    }
    w();
    const modeled = r.counterfactual.alternativeSchedules.filter((s) => s.isModeled);
    for (const s of modeled) {
      w(
        `**${s.label} is MODELLED, not measured** — ${s.modelNote}. A price-only 60/40 would be ` +
          `wrong by double digits: BND's price return is roughly −16% inception-to-date against a ` +
          `broadly flat total return, and that entire gap would have flattered the active book.`
      );
      w();
    }
  }
}

function actualReturnSince(r: BehaviorAnalyticsReport, freezeDate: string): number | null {
  const series = r.series.portfolioTwrr;
  const before = series.filter((p) => p.date <= freezeDate);
  if (before.length === 0 || series.length === 0) return null;
  const anchor = before[before.length - 1].growthOfDollar;
  if (anchor === 0) return null;
  return (series[series.length - 1].growthOfDollar / anchor - 1) * 100;
}

function renderAttribution(r: BehaviorAnalyticsReport, w: Writer): void {
  w(`## Where the money came from`);
  w();
  w(
    `P&L over a window is \`[MV(end) − MV(start)] − net invested + dividends\`. Additive ` +
      `by construction, so the rows always sum to the total, and inherently ` +
      `transfer-safe: an inter-broker move cancels between the two legs.`
  );
  w();

  renderSleeveTable("Inception to date", r.attribution.itdBySleeve, w);
  renderSleeveTable("Pre-2025", r.attribution.pre2025BySleeve, w);
  renderSleeveTable("2025 onward", r.attribution.post2025BySleeve, w);

  const sector = r.attribution.itdBySector;
  w(`### By sector, inception to date`);
  w();
  w(
    `Funds sit in their own bucket rather than a sector: the data source labels every ETF ` +
      `"Financial Services", which would file VTI, BND and VNQ together.`
  );
  w();
  w(`| Sector | P&L | Avg capital while held | Return on capital | Share of total P&L |`);
  w(`| --- | ---: | ---: | ---: | ---: |`);
  for (const row of [...sector.rows].sort((a, b) => b.pnlUsd - a.pnlUsd)) {
    w(
      `| ${row.label} | ${formatPnLRounded(row.pnlUsd)} | ` +
        `${formatCurrencyRounded(row.avgCapitalUsd)} | ` +
        `${formatPercent(row.returnOnAvgCapitalPct)} | ${formatPercent(row.shareOfTotalPct)} |`
    );
  }
  w();

  const contrib = r.attribution.contributionBySleeve;
  w(`### Contribution to return (time-linked)`);
  w();
  w(
    `The tables above measure dollars. This one measures *return*: each sleeve's share of the ` +
      `${formatPercent(contrib.totalReturnPct)} time-weighted total, weighted daily and linked ` +
      `across periods with the Cariño method so the rows sum to the total exactly ` +
      `(residual ${contrib.residualPct.toExponential(1)} pp).`
  );
  w();
  w(`| Sleeve | Contribution | Average weight | Days held |`);
  w(`| --- | ---: | ---: | ---: |`);
  for (const row of contrib.rows) {
    w(
      `| ${row.label} | ${formatPercent(row.contributionPct)} | ` +
        `${formatPercent(row.avgWeightPct)} | ${row.daysWithExposure} |`
    );
  }
  w(`| **Total** | ${formatPercent(contrib.totalReturnPct)} | | |`);
  w();

  const dollarBySleeve = new Map(r.attribution.itdBySleeve.rows.map((x) => [x.key, x.pnlUsd]));
  const conflicts = contrib.rows.filter((x) => {
    const dollars = dollarBySleeve.get(x.key);
    return (
      dollars !== undefined &&
      Math.abs(dollars) > 100 &&
      Math.sign(dollars) !== Math.sign(x.contributionPct)
    );
  });
  if (conflicts.length > 0) {
    w(
      `**Three of these disagree in sign with the dollar table above, and both are right.** ` +
        conflicts
          .map(
            (x) =>
              `${x.label} made ${formatPnLRounded(dollarBySleeve.get(x.key) ?? null)} but ` +
              `contributed ${formatPercent(x.contributionPct)}`
          )
          .join("; ") +
        `. Dollars are money-weighted: they credit gains whenever they happened, including on ` +
        `capital added late. Contribution is time-weighted: it charges a sleeve for the ` +
        `*capacity* it occupied. A sleeve holding ${formatPercent(
          conflicts[0].avgWeightPct
        )} of the book for years while going nowhere shows a small dollar profit and a large ` +
        `drag on return, because that weight could have been somewhere else. For "did this ` +
        `sleeve earn its place", the contribution column is the one to read.`
    );
    w();
  }

  const topContrib = r.attribution.contributionByTicker.rows;
  if (topContrib.length > 0) {
    w(`Top and bottom contributors by name:`);
    w();
    w(`| Name | Contribution | Average weight | Days held |`);
    w(`| --- | ---: | ---: | ---: |`);
    for (const row of topContrib.slice(0, 10)) {
      w(
        `| ${row.label} | ${formatPercent(row.contributionPct)} | ` +
          `${formatPercent(row.avgWeightPct)} | ${row.daysWithExposure} |`
      );
    }
    w(`| … | | | |`);
    for (const row of topContrib.slice(-5)) {
      w(
        `| ${row.label} | ${formatPercent(row.contributionPct)} | ` +
          `${formatPercent(row.avgWeightPct)} | ${row.daysWithExposure} |`
      );
    }
    w();
  }

  const byTicker = r.attribution.itdByTicker;
  w(`### Best and worst names, inception to date`);
  w();
  w(
    `Average capital is meaned over the days a name was actually held, not over the whole ` +
      `window — otherwise a six-week option position divides by a denominator near zero.`
  );
  w();
  w(`| Name | Sleeve | P&L | Avg capital while held | Days held | Return on capital | Share of total |`);
  w(`| --- | --- | ---: | ---: | ---: | ---: | ---: |`);
  for (const row of byTicker.rows.slice(0, 15)) {
    w(rowLine(row));
  }
  w(`| … | | | | | | |`);
  for (const row of byTicker.rows.slice(-10)) {
    w(rowLine(row));
  }
  w();

  function rowLine(row: AttributionResult["rows"][number]): string {
    return (
      `| ${row.label} | ${row.sleeve ?? "—"} | ${formatPnLRounded(row.pnlUsd)} | ` +
      `${formatCurrencyRounded(row.avgCapitalUsd)} | ${row.daysWithExposure} | ` +
      `${formatPercent(row.returnOnAvgCapitalPct)} | ${formatPercent(row.shareOfTotalPct)} |`
    );
  }
}

function renderSleeveTable(title: string, attr: AttributionResult, w: Writer): void {
  w(`### ${title} (${attr.from} → ${attr.to})`);
  w();
  w(`| Sleeve | P&L | Avg capital while held | Return on capital | Share of total P&L |`);
  w(`| --- | ---: | ---: | ---: | ---: |`);
  const ordered = [...attr.rows].sort(
    (a, b) =>
      SLEEVE_ORDER.indexOf(a.key as never) - SLEEVE_ORDER.indexOf(b.key as never)
  );
  for (const row of ordered) {
    w(
      `| ${row.label} | ${formatPnLRounded(row.pnlUsd)} | ` +
        `${formatCurrencyRounded(row.avgCapitalUsd)} | ` +
        `${formatPercent(row.returnOnAvgCapitalPct)} | ${formatPercent(row.shareOfTotalPct)} |`
    );
  }
  w(
    `| **Total** | ${formatPnLRounded(attr.total.pnlUsd)} | ` +
      `${formatCurrencyRounded(attr.total.avgCapitalUsd)} (whole-window mean) | | |`
  );
  w();
}

function renderBehaviour(r: BehaviorAnalyticsReport, w: Writer): void {
  const b = r.behavior;

  w(`## Trading behaviour`);
  w();

  w(`### Win / loss`);
  w();
  w(winLossTable(b.winLoss));
  w();
  w(`By sleeve:`);
  w();
  w(`| Sleeve | n | Win rate | Avg win | Avg loss | Profit factor | Total P&L |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const s of b.winLossBySleeve) {
    w(
      `| ${s.sleeve} | ${s.stats.n} | ${formatPercent(s.stats.winRatePct)} | ` +
        `${formatPercent(s.stats.avgWinPct)} | ${formatPercent(s.stats.avgLossPct)} | ` +
        `${fmtRatio(s.stats.profitFactor)} | ${formatPnLRounded(s.stats.totalPnlUsd)} |`
    );
  }
  w();

  const hp = b.holdingPeriod;
  w(`### Holding period and the disposition effect`);
  w();
  w(`| Cohort | n | Median days | Mean | p25 | p75 | Max |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const [label, d] of [
    ["All closed", hp.all],
    ["Winners", hp.winners],
    ["Losers", hp.losers],
    ["Still open (age)", hp.openEpisodeAges],
  ] as const) {
    w(
      `| ${label} | ${d.n} | ${fmtNum(d.median)} | ${fmtNum(d.mean)} | ` +
        `${fmtNum(d.p25)} | ${fmtNum(d.p75)} | ${fmtNum(d.max)} |`
    );
  }
  w();
  w(
    `Median gap (losers − winners): **${fmtNum(hp.medianGapDays)} days**` +
      (hp.dollarWeightedGapDays !== null
        ? `, ${fmtNum(hp.dollarWeightedGapDays)} days dollar-weighted`
        : "") +
      `. Mann-Whitney p = ${fmtP(hp.test.pValue)} on n=${hp.test.n1} winners vs n=${hp.test.n2} losers.`
  );
  w();
  w(
    `Note the direction of the bias: ${hp.openEpisodeAges.n} episodes are still open with a ` +
      `median age of ${fmtNum(hp.openEpisodeAges.median)} days, and long-running winners are ` +
      `over-represented among them. Excluding them shortens the winner distribution, which ` +
      `inflates any apparent disposition effect.`
  );
  w();

  const a = b.averaging;
  w(`### Averaging up vs averaging down`);
  w();
  w(
    `${a.addsAboveAvgCost} adds above running cost (${formatCurrencyRounded(a.addUpUsd)}), ` +
      `${a.addsBelowAvgCost} below (${formatCurrencyRounded(a.addDownUsd)}). ` +
      `Mean add vs running cost: ${formatPercent(a.meanVsAvgCostPct)}.`
  );
  w();
  w(`| Cohort | n | Win rate | Mean return | Median return | Total P&L | Capital deployed |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const c of a.cohorts) {
    w(
      `| ${c.cohort} | ${c.n} | ${formatPercent(c.winRatePct)} | ` +
        `${formatPercent(c.meanReturnPct)} | ${formatPercent(c.medianReturnPct)} | ` +
        `${formatPnLRounded(c.totalPnlUsd)} | ${formatCurrencyRounded(c.totalInvestedUsd)} |`
    );
  }
  w();

  w(`### Turnover`);
  w();
  w(
    `Against average AUM, not absolute dollars — the book grew roughly 300x, so gross ` +
      `traded says nothing on its own. Transfers are netted by matched notional.`
  );
  w();
  w(`| Year | Bought | Sold | Bought ex-transfer | Sold ex-transfer | Avg AUM | Turnover | One-way | Trades | Trade days |`);
  w(`| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  for (const t of b.turnover) {
    w(
      `| ${t.year}${t.isPartialYear ? " (partial)" : ""} | ${formatCurrencyRounded(t.buysUsd)} | ` +
        `${formatCurrencyRounded(t.sellsUsd)} | ${formatCurrencyRounded(t.buysExTransferUsd)} | ` +
        `${formatCurrencyRounded(t.sellsExTransferUsd)} | ${formatCurrencyRounded(t.avgAumUsd)} | ` +
        `${fmtX(t.turnoverRatio)} | ${fmtX(t.oneWayTurnover)} | ${t.tradeCount} | ${t.tradeDays} |`
    );
  }
  w();

  const gaps = b.outOfMarket.filter((s) => s.episodes.length > 0);
  if (gaps.length > 0) {
    w(`### Time out of the market`);
    w();
    w(
      `Windows where committed capital fell below its own high-water mark and later ` +
        `recovered — money pulled out and put back. Inferred from the flow record because ` +
        `the database has no cash account, which is exactly why this cost is otherwise invisible.`
    );
    w();
    w(`| Scope | From | To | Days | Capital out | SPY over window | Estimated drag |`);
    w(`| --- | --- | --- | ---: | ---: | ---: | ---: |`);
    for (const s of gaps) {
      for (const e of s.episodes) {
        w(
          `| ${s.scope} | ${e.startDate} | ${e.endDate} | ${e.days} | ` +
            `${formatCurrencyRounded(e.capitalOutUsd)} | ${formatPercent(e.benchmarkReturnPct)} | ` +
            `${formatPnLRounded(e.estimatedDragUsd === null ? null : -e.estimatedDragUsd)} |`
        );
      }
    }
    w();
  }
}

function winLossTable(s: WinLossStats): string {
  return [
    `| Measure | Value |`,
    `| --- | ---: |`,
    `| Closed episodes | ${s.n} |`,
    `| Wins / losses / flats | ${s.wins} / ${s.losses} / ${s.flats} |`,
    `| Win rate | ${formatPercent(s.winRatePct)} |`,
    `| Win rate by capital deployed | ${formatPercent(s.winRateByDollarsPct)} |`,
    `| Average win | ${formatPercent(s.avgWinPct)} (${formatPnLRounded(s.avgWinUsd)}) |`,
    `| Average loss | ${formatPercent(s.avgLossPct)} (${formatPnLRounded(s.avgLossUsd)}) |`,
    `| Win/loss ratio | ${fmtRatio(s.winLossRatio)} |`,
    `| Expectancy per episode | ${formatPercent(s.expectancyPct)} (${formatPnLRounded(s.expectancyPerEpisodeUsd)}) |`,
    `| Profit factor | ${fmtRatio(s.profitFactor)} |`,
    `| Total realised P&L | ${formatPnLRounded(s.totalPnlUsd)} |`,
  ].join("\n");
}

function renderEpisodes(r: BehaviorAnalyticsReport, w: Writer): void {
  w(`## Closed round-trips`);
  w();
  w(
    `Ranked by dollars, not percent — with weighted-average cost and no lot tracking, a ` +
      `return percentage divides by total capital deployed and is not comparable across ` +
      `episodes with different trade counts.`
  );
  w();
  w(`| Name | Sleeve | Opened | Closed | Days | Invested | Price P&L | Income | Total P&L | Return | Buys/Sells |`);
  w(`| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  const sorted = [...r.episodes.closed].sort(
    (a, b) => (b.totalPnlUsd ?? 0) - (a.totalPnlUsd ?? 0)
  );
  for (const e of sorted) {
    w(
      `| ${e.ticker}${e.instrument === "option" ? " (opt)" : ""} | ${e.sleeve ?? "—"} | ` +
        `${e.openDate} | ${e.closeDate ?? "—"} | ${e.holdingDays} | ` +
        `${formatCurrencyRounded(e.totalInvestedUsd)} | ${formatPnLRounded(e.pricePnlUsd)} | ` +
        `${formatCurrencyRounded(e.incomePnlUsd)} | ${formatPnLRounded(e.totalPnlUsd)} | ` +
        `${formatPercent(e.totalReturnPct)} | ${e.buyCount}/${e.sellCount} |`
    );
  }
  w();

  w(`### Still open`);
  w();
  w(`| Name | Sleeve | Opened | Age (days) | Invested | Market value | Unrealised | Income | Total P&L | Return |`);
  w(`| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`);
  const open = [...r.episodes.open].sort(
    (a, b) => (b.marketValueUsd ?? 0) - (a.marketValueUsd ?? 0)
  );
  for (const e of open) {
    w(
      `| ${e.ticker}${e.instrument === "option" ? " (opt)" : ""} | ${e.sleeve ?? "—"} | ` +
        `${e.openDate} | ${e.holdingDays} | ${formatCurrencyRounded(e.totalInvestedUsd)} | ` +
        `${formatCurrencyRounded(e.marketValueUsd)} | ` +
        `${formatPnLRounded((e.marketValueUsd ?? 0) - e.costBasisRemainingUsd)} | ` +
        `${formatCurrencyRounded(e.incomePnlUsd)} | ${formatPnLRounded(e.totalPnlUsd)} | ` +
        `${formatPercent(e.totalReturnPct)} |`
    );
  }
  w();
}

function renderTransfers(r: BehaviorAnalyticsReport, w: Writer): void {
  w(`## Detected inter-broker transfers`);
  w();
  w(
    `Excluded from behaviour metrics by matched notional. Published in full so the ` +
      `exclusion is auditable rather than silent. Matching requires the two legs to sit in ` +
      `**different** portfolios — this ledger contains genuine same-day sell-then-buy pairs ` +
      `inside one account that must not be flagged.`
  );
  w();
  w(
    `${r.transfers.pairs.length} pairs · ${formatCurrencyRounded(r.transfers.totalSellUsd)} sold ` +
      `/ ${formatCurrencyRounded(r.transfers.totalBuyUsd)} bought.`
  );
  w();
  w(`| Sell date | Buy date | Name | From | To | Qty | Notional | Price delta | Confidence |`);
  w(`| --- | --- | --- | --- | --- | ---: | ---: | ---: | --- |`);
  for (const p of r.transfers.pairs) {
    w(
      `| ${p.sellDate} | ${p.buyDate} | ${p.ticker} | ${p.sellPortfolio} | ${p.buyPortfolio} | ` +
        `${p.qtyMatched.toFixed(4)} | ${formatCurrencyRounded(p.sellMatchedUsd)} | ` +
        `${p.priceDeltaPct.toFixed(3)}% | ${p.confidence} |`
    );
  }
  w();
}

function renderDataQuality(r: BehaviorAnalyticsReport, w: Writer): void {
  const d = r.dataQuality;
  w(`## Data quality`);
  w();
  w(
    `- **Off-calendar rows:** ${d.offCalendarRows.total} transactions fall on dates absent ` +
      `from the trading calendar (${d.offCalendarRows.trades} of them trades, ` +
      `${formatCurrencyRounded(d.offCalendarRows.tradeNotionalUsd)} notional). This report ` +
      `folds them into the next trading day; the app's chart engine drops them, which is why ` +
      `its figures differ. Dates: ${d.offCalendarRows.dates.join(", ") || "none"}.`
  );
  w(
    `- **Fee rows:** ${d.feeRowsWithZeroFeeColumn} \`fee\` rows carry zero in the \`fees\` ` +
      `column with the amount in \`grossAmount\`. The computation engine reads \`fees\`, so ` +
      `they are no-ops. Mirrored here deliberately to keep reconciliation exact.`
  );
  w(`- **Option marks in the entire database:** ${d.optionMarkCount}.`);
  w(`- **Episode anomalies:** ${d.episodeAnomalies.length}.`);
  w(`- **Unmapped tickers:** ${d.unmappedTickers.join(", ") || "none"}.`);
  if (d.maxStaleValueShare) {
    w(
      `- **Worst stale-price day:** ${d.maxStaleValueShare.date}, ` +
        `${formatPercent(d.maxStaleValueShare.sharePct)} of market value priced off a quote ` +
        `more than a week old.`
    );
  }
  w();
  if (d.thinCoverage.length > 0) {
    w(`Names with under one year of price history:`);
    w();
    w(`| Ticker | Rows | First | Last |`);
    w(`| --- | ---: | --- | --- |`);
    for (const c of d.thinCoverage) {
      w(`| ${c.ticker} | ${c.rows} | ${c.firstDate} | ${c.lastDate} |`);
    }
    w();
  }
}

function fmtNum(v: number | null): string {
  return v === null ? "N/A" : v.toFixed(0);
}

function fmtRatio(v: number | null): string {
  return v === null ? "N/A" : `${v.toFixed(2)}x`;
}

/** Plain two-decimal number — for betas, correlations and Sharpe-style ratios. */
function fmtRatio2(v: number | null): string {
  return v === null ? "N/A" : v.toFixed(2);
}

function fmtX(v: number | null): string {
  return v === null ? "N/A" : `${v.toFixed(2)}x`;
}

function fmtP(v: number | null): string {
  if (v === null) return "N/A";
  return v < 0.001 ? "<0.001" : v.toFixed(3);
}
