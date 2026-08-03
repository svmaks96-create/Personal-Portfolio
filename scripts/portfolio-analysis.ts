/**
 * Read-only behaviour, counterfactual and attribution analysis over the whole
 * transaction ledger.
 *
 * Reuses the app's computation chain wherever it is correct, and deliberately
 * departs from it in two documented places: transactions dated on non-trading
 * days are folded into the next trading day rather than dropped, and per-name
 * state is keyed by (portfolio, ticker, instrument) rather than pooled by
 * ticker. Both changes make the terminal snapshot tie to `computePositions`.
 *
 * Never writes to the database.
 *
 *   npm run report:analysis -- [flags]
 *
 *   --portfolio=<name>   scope to one portfolio (default: combined + per-portfolio)
 *   --from=<yyyy-MM-dd>  start measurement here instead of at inception. State is
 *                        still walked from the first transaction, so opening
 *                        positions stay correct; only measurement moves.
 *   --freeze=<date>      freeze date for the counterfactual; repeatable
 *   --out=<dir>          output directory (default: data/analytics)
 *   --slim               drop per-trade detail and daily series
 *   --stdout             write JSON to stdout instead of files
 *   --no-markdown        skip the .md render
 *   --daily              include the full per-day per-holding series (large)
 *   --pretty             pretty-print the JSON
 *   --rf=<pct>           annual risk-free rate for Sharpe/Sortino (default 0)
 *   --corr-window=<n>    correlation lookback in trading days (default 252)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getBehaviorAnalytics } from "../src/server/queries/behavior-analytics";
import { renderMarkdown } from "./portfolio-analysis-markdown";

interface Flags {
  portfolio?: string;
  from?: string;
  freeze: string[];
  out: string;
  slim: boolean;
  stdout: boolean;
  markdown: boolean;
  daily: boolean;
  pretty: boolean;
  riskFreeAnnualPct: number;
  correlationWindowDays: number;
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = {
    freeze: [],
    out: join("data", "analytics"),
    slim: false,
    stdout: false,
    markdown: true,
    daily: false,
    pretty: false,
    riskFreeAnnualPct: 0,
    correlationWindowDays: 252,
  };

  for (const arg of argv) {
    const match = /^--([\w-]+)(?:=(.*))?$/.exec(arg);
    if (!match) {
      throw new Error(`Unrecognised argument: ${arg}`);
    }
    const [, name, value] = match;
    switch (name) {
      case "portfolio":
        flags.portfolio = requireValue(name, value);
        break;
      case "from": {
        const parsed = requireValue(name, value);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
          throw new Error(`--from must be yyyy-MM-dd, e.g. --from=2024-01-01`);
        }
        flags.from = parsed;
        break;
      }
      case "freeze":
        flags.freeze.push(requireValue(name, value));
        break;
      case "out":
        flags.out = requireValue(name, value);
        break;
      case "slim":
        flags.slim = true;
        break;
      case "stdout":
        flags.stdout = true;
        break;
      case "no-markdown":
        flags.markdown = false;
        break;
      case "daily":
        flags.daily = true;
        break;
      case "pretty":
        flags.pretty = true;
        break;
      case "rf": {
        const parsed = Number(requireValue(name, value));
        if (!Number.isFinite(parsed)) {
          throw new Error(`--rf must be a number, e.g. --rf=4`);
        }
        flags.riskFreeAnnualPct = parsed;
        break;
      }
      case "corr-window": {
        const parsed = Number(requireValue(name, value));
        if (!Number.isInteger(parsed) || parsed < 2) {
          throw new Error(`--corr-window must be an integer of at least 2`);
        }
        flags.correlationWindowDays = parsed;
        break;
      }
      default:
        throw new Error(`Unknown flag: --${name}`);
    }
  }
  return flags;
}

function requireValue(name: string, value: string | undefined): string {
  if (value === undefined || value === "") {
    throw new Error(`--${name} requires a value, e.g. --${name}=2024-12-31`);
  }
  return value;
}

function main(): void {
  const flags = parseFlags(process.argv.slice(2));

  const report = getBehaviorAnalytics({
    portfolio: flags.portfolio,
    from: flags.from,
    freezeDates: flags.freeze.length > 0 ? flags.freeze : undefined,
    includeDailyHoldings: flags.daily,
    includeTradeDetail: !flags.slim,
    riskFreeAnnualPct: flags.riskFreeAnnualPct,
    correlationWindowDays: flags.correlationWindowDays,
  });

  if (flags.slim) {
    report.series.portfolioTwrr = [];
    report.series.benchmarkGrowth = {};
    report.risk.rollingVol90 = [];
    report.timing.entry.rows = [];
    report.timing.exit.rows = [];
    for (const f of report.counterfactual.frozenBooks) f.series = [];
    for (const d of [
      ...report.counterfactual.depositsOnly,
      ...report.counterfactual.alternativeSchedules,
    ]) {
      d.series = [];
      d.deposits = [];
    }
  }

  const json = JSON.stringify(report, null, flags.pretty ? 2 : 0);

  if (flags.stdout) {
    process.stdout.write(json);
    return;
  }

  const scopeSlug = (flags.portfolio ?? "combined")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const stamp = report.meta.valuationAsOf.replace(/-/g, "");

  mkdirSync(flags.out, { recursive: true });
  const jsonPath = join(flags.out, `analysis-${scopeSlug}-${stamp}.json`);
  writeFileSync(jsonPath, json, "utf8");
  writeFileSync(join(flags.out, "latest.json"), json, "utf8");

  const written = [jsonPath];
  if (flags.markdown) {
    const md = renderMarkdown(report);
    const mdPath = join(flags.out, `analysis-${scopeSlug}-${stamp}.md`);
    writeFileSync(mdPath, md, "utf8");
    writeFileSync(join(flags.out, "latest.md"), md, "utf8");
    written.push(mdPath);
  }

  const c = report.meta.counts;
  process.stderr.write(
    [
      `Scope           ${report.meta.scope}`,
      `Window          ${report.meta.analysisFrom} -> ${report.meta.valuationAsOf}` +
        (report.meta.isWindowed ? `  (inception ${report.meta.inception})` : ""),
      `Ledger          ${report.meta.inception} -> ${report.meta.ledgerAsOf}`,
      `Valued at       ${report.meta.valuationAsOf}`,
      `Transactions    ${c.transactions}`,
      `Episodes        ${c.consolidatedEpisodes} consolidated (${c.closedEpisodes} closed, ${c.openEpisodes} open)`,
      `Transfer pairs  ${c.transferPairs}`,
      `Anomalies       ${report.dataQuality.episodeAnomalies.length}`,
      ``,
      `Written:`,
      ...written.map((p) => `  ${p}`),
      `  ${join(flags.out, "latest.json")}`,
      ...(flags.markdown ? [`  ${join(flags.out, "latest.md")}`] : []),
      ``,
    ].join("\n")
  );
}

main();
