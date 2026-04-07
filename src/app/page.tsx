import { Suspense } from "react";
import { EmptyState } from "@/components/domain/empty-state";
import { DashboardMetrics } from "@/components/domain/dashboard-metrics";
import { MetricCardsSkeleton } from "@/components/domain/metric-card-skeleton";
import { getTransactionCount } from "@/server/queries/transactions";

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

  return (
    <div className="space-y-8">
      <Suspense fallback={<MetricCardsSkeleton />}>
        <DashboardMetrics portfolio={portfolioFilter} />
      </Suspense>
    </div>
  );
}
