import { getDashboardMetrics } from "@/server/queries/dashboard";
import { formatCurrencyRounded, formatPnLRounded, formatIRRRounded } from "@/lib/formatting";
import { MetricCard } from "@/components/domain/metric-card";

interface DashboardMetricsProps {
  portfolio?: string;
}

export async function DashboardMetrics({ portfolio }: DashboardMetricsProps) {
  const metrics = getDashboardMetrics(portfolio);

  const realizedPnlDirection =
    metrics.totalRealizedPnl === null || metrics.totalRealizedPnl === 0
      ? null
      : metrics.totalRealizedPnl > 0
        ? "positive"
        : "negative";

  const unrealizedPnlDirection =
    metrics.totalUnrealizedPnl === null || metrics.totalUnrealizedPnl === 0
      ? null
      : metrics.totalUnrealizedPnl > 0
        ? "positive"
        : "negative";

  const irrDirection =
    metrics.irr === null || metrics.irr === 0
      ? null
      : metrics.irr > 0
        ? "positive"
        : "negative";

  return (
    <div className="grid grid-cols-5 gap-4">
      <MetricCard
        label="Total Value"
        value={formatCurrencyRounded(metrics.totalValue)}
      />
      <MetricCard
        label="Cost Basis"
        value={formatCurrencyRounded(metrics.totalCostBasis)}
      />
      <MetricCard
        label="Realized P&L"
        value={formatPnLRounded(metrics.totalRealizedPnl)}
        variant="pnl"
        pnlDirection={realizedPnlDirection}
      />
      <MetricCard
        label="Unrealized P&L"
        value={formatPnLRounded(metrics.totalUnrealizedPnl)}
        variant="pnl"
        pnlDirection={unrealizedPnlDirection}
      />
      <MetricCard
        label="IRR"
        value={formatIRRRounded(metrics.irr)}
        variant="pnl"
        pnlDirection={irrDirection}
      />
    </div>
  );
}
