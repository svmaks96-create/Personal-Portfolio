import { getDashboardMetrics } from "@/server/queries/dashboard";
import { formatCurrencyRounded, formatPnLRounded, formatIRRRounded } from "@/lib/formatting";
import { pnlDirection } from "@/lib/pnl";
import { MetricCard } from "@/components/domain/metric-card";

interface DashboardMetricsProps {
  portfolio?: string;
}

export async function DashboardMetrics({ portfolio }: DashboardMetricsProps) {
  const metrics = getDashboardMetrics(portfolio);

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
        pnlDirection={pnlDirection(metrics.totalRealizedPnl)}
      />
      <MetricCard
        label="Unrealized P&L"
        value={formatPnLRounded(metrics.totalUnrealizedPnl)}
        variant="pnl"
        pnlDirection={pnlDirection(metrics.totalUnrealizedPnl)}
      />
      <MetricCard
        label="IRR"
        value={formatIRRRounded(metrics.irr)}
        variant="pnl"
        pnlDirection={pnlDirection(metrics.irr)}
      />
    </div>
  );
}
