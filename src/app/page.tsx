import { Suspense } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { DashboardMetrics } from "@/components/domain/dashboard-metrics";
import { MetricCardsSkeleton } from "@/components/domain/metric-card-skeleton";
import { PortfolioConcentration } from "@/components/domain/portfolio-concentration";
import { ConcentrationChartSkeleton } from "@/components/domain/concentration-chart-skeleton";
import { PerformanceVsBenchmarks } from "@/components/domain/performance-vs-benchmarks";
import { PerformanceSkeleton } from "@/components/domain/performance-skeleton";
import { ControlsBar } from "@/components/domain/controls-bar";
import { TerminalHeading } from "@/components/domain/terminal-heading";
import { getTransactionCount } from "@/server/queries/transactions";
import { getStalestMarketDate } from "@/server/queries/market-data";
import { periodSchema } from "@/shared/schemas/period";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const count = getTransactionCount();

  if (count === 0) {
    return (
      <EmptyState
        message="No positions yet. Import transactions to get started."
        actionLabel="Import Transactions"
        actionHref="/import"
      />
    );
  }

  const { portfolio, period: periodRaw } = await searchParams;
  const portfolioFilter =
    typeof portfolio === "string" ? portfolio : undefined;
  const period = periodSchema.catch("1Y").parse(periodRaw);

  const timestamp = getStalestMarketDate();

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading portfolio={portfolioFilter} />
      <ControlsBar timestamp={timestamp} />
      <Suspense fallback={<MetricCardsSkeleton />}>
        <DashboardMetrics portfolio={portfolioFilter} />
      </Suspense>
      <div className="grid grid-cols-[1.6fr_1fr] gap-4">
        <Suspense fallback={<PerformanceSkeleton />}>
          <PerformanceVsBenchmarks portfolio={portfolioFilter} period={period} />
        </Suspense>
        <Suspense fallback={<ConcentrationChartSkeleton />}>
          <PortfolioConcentration portfolio={portfolioFilter} />
        </Suspense>
      </div>
    </div>
  );
}
