import { Suspense } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { TerminalHeading } from "@/components/domain/terminal-heading";
import { TerminalSectionHeading } from "@/components/domain/terminal-section-heading";
import { AnalyticsKpis } from "@/components/domain/analytics-kpis";
import { AnalyticsCaveatsPanel } from "@/components/domain/analytics-caveats-panel";
import { AnalyticsRiskPanel } from "@/components/domain/analytics-risk-panel";
import { AnalyticsDrawdownPanel } from "@/components/domain/analytics-drawdown-panel";
import { AnalyticsRegimePanel } from "@/components/domain/analytics-regime-panel";
import { AnalyticsContributionPanel } from "@/components/domain/analytics-contribution-panel";
import { AnalyticsConcentrationPanel } from "@/components/domain/analytics-concentration-panel";
import { AnalyticsBehaviourPanel } from "@/components/domain/analytics-behaviour-panel";
import { AnalyticsTimingPanel } from "@/components/domain/analytics-timing-panel";
import { AnalyticsCounterfactualPanel } from "@/components/domain/analytics-counterfactual-panel";
import {
  AnalyticsPanelSkeleton,
  AnalyticsPairSkeleton,
  AnalyticsCaveatsSkeleton,
  AnalyticsBehaviourSkeleton,
} from "@/components/domain/analytics-skeleton";
import { MetricCardsSkeleton } from "@/components/domain/metric-card-skeleton";
import { getTransactionCount } from "@/server/queries/transactions";

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const count = getTransactionCount();

  if (count === 0) {
    return (
      <EmptyState
        message="No transactions yet. Import a ledger to see decision analytics."
        actionLabel="Import Transactions"
        actionHref="/import"
      />
    );
  }

  const { portfolio } = await searchParams;
  const portfolioFilter = typeof portfolio === "string" ? portfolio : undefined;

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading portfolio={portfolioFilter} />

      <Suspense fallback={<MetricCardsSkeleton />}>
        <AnalyticsKpis portfolio={portfolioFilter} />
      </Suspense>

      <Suspense fallback={<AnalyticsCaveatsSkeleton />}>
        <AnalyticsCaveatsPanel portfolio={portfolioFilter} />
      </Suspense>

      <TerminalSectionHeading label="Risk" hint="Daily, chain-linked" />
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Suspense fallback={<AnalyticsPanelSkeleton rows={12} />}>
          <AnalyticsRiskPanel portfolio={portfolioFilter} />
        </Suspense>
        <Suspense fallback={<AnalyticsPanelSkeleton rows={10} />}>
          <AnalyticsDrawdownPanel portfolio={portfolioFilter} />
        </Suspense>
      </div>

      <TerminalSectionHeading label="Attribution" hint="Where the return came from" />
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Suspense fallback={<AnalyticsPanelSkeleton rows={9} />}>
          <AnalyticsContributionPanel portfolio={portfolioFilter} />
        </Suspense>
        <Suspense fallback={<AnalyticsPanelSkeleton rows={7} />}>
          <AnalyticsConcentrationPanel portfolio={portfolioFilter} />
        </Suspense>
      </div>

      <Suspense fallback={<AnalyticsPanelSkeleton rows={4} />}>
        <AnalyticsRegimePanel portfolio={portfolioFilter} />
      </Suspense>

      <TerminalSectionHeading label="Behaviour" hint="Closed round-trips" />
      <Suspense fallback={<AnalyticsBehaviourSkeleton />}>
        <AnalyticsBehaviourPanel portfolio={portfolioFilter} />
      </Suspense>

      <TerminalSectionHeading label="Timing" hint="Entry and exit quality" />
      <Suspense fallback={<AnalyticsPairSkeleton rows={6} />}>
        <AnalyticsTimingPanel portfolio={portfolioFilter} />
      </Suspense>

      <TerminalSectionHeading label="Counterfactuals" hint="Versus doing nothing" />
      <Suspense fallback={<AnalyticsPanelSkeleton rows={8} />}>
        <AnalyticsCounterfactualPanel portfolio={portfolioFilter} />
      </Suspense>
    </div>
  );
}
