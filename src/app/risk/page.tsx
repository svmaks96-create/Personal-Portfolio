import { Suspense } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { TerminalHeading } from "@/components/domain/terminal-heading";
import { TerminalSectionHeading } from "@/components/domain/terminal-section-heading";
import { RiskViewBar } from "@/components/domain/risk-view-bar";
import { RiskKpis } from "@/components/domain/risk-kpis";
import { RiskCaveatsPanel } from "@/components/domain/risk-caveats-panel";
import { RiskContributionPanel } from "@/components/domain/risk-contribution-panel";
import { RiskVolDragPanel } from "@/components/domain/risk-vol-drag-panel";
import { RiskBetsPanel } from "@/components/domain/risk-bets-panel";
import { RiskWhatIfPanel } from "@/components/domain/risk-whatif-panel";
import { RiskFactorPanel } from "@/components/domain/risk-factor-panel";
import { RiskAlphaPanel } from "@/components/domain/risk-alpha-panel";
import { RiskScenarioPanel } from "@/components/domain/risk-scenario-panel";
import { AnalyticsPanelSkeleton } from "@/components/domain/analytics-skeleton";
import { MetricCardsSkeleton } from "@/components/domain/metric-card-skeleton";
import { getTransactionCount } from "@/server/queries/transactions";
import {
  riskUniverseSchema,
  riskWindowSchema,
  DEFAULT_RISK_UNIVERSE,
  DEFAULT_RISK_WINDOW,
} from "@/shared/schemas/risk-view";

export default async function RiskPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const count = getTransactionCount();

  if (count === 0) {
    return (
      <EmptyState
        message="No transactions yet. Import a ledger to see risk engineering."
        actionLabel="Import Transactions"
        actionHref="/import"
      />
    );
  }

  const {
    portfolio,
    universe: universeRaw,
    window: windowRaw,
    wiFrom,
    wiTo,
    wiAmt,
  } = await searchParams;
  const portfolioFilter = typeof portfolio === "string" ? portfolio : undefined;
  const universe = riskUniverseSchema
    .catch(DEFAULT_RISK_UNIVERSE)
    .parse(universeRaw);
  const window = riskWindowSchema.catch(DEFAULT_RISK_WINDOW).parse(windowRaw);

  const whatIfFrom = typeof wiFrom === "string" && wiFrom !== "" ? wiFrom : undefined;
  const whatIfTo = typeof wiTo === "string" && wiTo !== "" ? wiTo : undefined;
  const whatIfAmountParsed = typeof wiAmt === "string" ? Number(wiAmt) : NaN;
  const whatIfAmountUsd =
    Number.isFinite(whatIfAmountParsed) && whatIfAmountParsed > 0
      ? whatIfAmountParsed
      : undefined;

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading portfolio={portfolioFilter} />

      <Suspense fallback={<div className="h-9 border border-line bg-panel" />}>
        <RiskViewBar
          portfolio={portfolioFilter}
          universe={universe}
          window={window}
        />
      </Suspense>

      <Suspense fallback={<MetricCardsSkeleton />}>
        <RiskKpis portfolio={portfolioFilter} universe={universe} window={window} />
      </Suspense>

      <Suspense fallback={<div className="h-24 border border-line bg-panel" />}>
        <RiskCaveatsPanel
          portfolio={portfolioFilter}
          universe={universe}
          window={window}
        />
      </Suspense>

      <TerminalSectionHeading
        label="Effective bets"
        hint="How many independent things you actually own"
      />
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Suspense fallback={<AnalyticsPanelSkeleton rows={10} />}>
          <RiskBetsPanel
            portfolio={portfolioFilter}
            universe={universe}
            window={window}
          />
        </Suspense>
        <Suspense fallback={<AnalyticsPanelSkeleton rows={6} />}>
          <RiskWhatIfPanel
            portfolio={portfolioFilter}
            universe={universe}
            window={window}
            whatIfFrom={whatIfFrom}
            whatIfTo={whatIfTo}
            whatIfAmountUsd={whatIfAmountUsd}
          />
        </Suspense>
      </div>

      <TerminalSectionHeading
        label="Factor decomposition"
        hint="Actual sleeve returns vs tradeable proxies"
      />
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Suspense fallback={<AnalyticsPanelSkeleton rows={10} />}>
          <RiskFactorPanel
            portfolio={portfolioFilter}
            universe={universe}
            window={window}
          />
        </Suspense>
        <Suspense fallback={<AnalyticsPanelSkeleton rows={6} />}>
          <RiskAlphaPanel
            portfolio={portfolioFilter}
            universe={universe}
            window={window}
          />
        </Suspense>
      </div>

      <TerminalSectionHeading
        label="Risk contribution"
        hint="Capital weight vs share of volatility"
      />
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Suspense fallback={<AnalyticsPanelSkeleton rows={14} />}>
          <RiskContributionPanel
            portfolio={portfolioFilter}
            universe={universe}
            window={window}
          />
        </Suspense>
        <Suspense fallback={<AnalyticsPanelSkeleton rows={10} />}>
          <RiskVolDragPanel
            portfolio={portfolioFilter}
            universe={universe}
            window={window}
          />
        </Suspense>
      </div>

      <TerminalSectionHeading
        label="Scenario replay"
        hint="Current weights through actual past episodes"
      />
      <div className="grid grid-cols-[2.2fr_1fr] gap-4">
        <Suspense
          fallback={
            <>
              <AnalyticsPanelSkeleton rows={8} />
              <AnalyticsPanelSkeleton rows={4} />
            </>
          }
        >
          <RiskScenarioPanel portfolio={portfolioFilter} universe={universe} />
        </Suspense>
      </div>
    </div>
  );
}
