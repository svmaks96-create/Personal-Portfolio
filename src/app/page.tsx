import { Suspense } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { DashboardMetrics } from "@/components/domain/dashboard-metrics";
import { MetricCardsSkeleton } from "@/components/domain/metric-card-skeleton";
import { PortfolioConcentration } from "@/components/domain/portfolio-concentration";
import { ConcentrationChartSkeleton } from "@/components/domain/concentration-chart-skeleton";
import { ControlsBar } from "@/components/domain/controls-bar";
import { getTransactionCount } from "@/server/queries/transactions";
import { getUniquePortfolios } from "@/server/queries/portfolios";
import { getStalestMarketDate } from "@/server/queries/market-data";

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

  const { portfolio } = await searchParams;
  const portfolioFilter =
    typeof portfolio === "string" ? portfolio : undefined;

  const portfolios = getUniquePortfolios();
  const timestamp = getStalestMarketDate();

  return (
    <div className="space-y-8">
      <ControlsBar
        portfolios={portfolios}
        selectedPortfolio={portfolioFilter}
        timestamp={timestamp}
      />
      <Suspense fallback={<MetricCardsSkeleton />}>
        <DashboardMetrics portfolio={portfolioFilter} />
      </Suspense>
      <Suspense fallback={<ConcentrationChartSkeleton />}>
        <PortfolioConcentration portfolio={portfolioFilter} />
      </Suspense>
    </div>
  );
}
