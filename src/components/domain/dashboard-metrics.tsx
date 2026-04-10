import { getDashboardMetrics } from "@/server/queries/dashboard";
import { formatCurrency, formatPnL, formatIRR } from "@/lib/formatting";
import { MetricCard } from "@/components/domain/metric-card";

interface DashboardMetricsProps {
  portfolio?: string;
}

export async function DashboardMetrics({ portfolio }: DashboardMetricsProps) {
  const metrics = getDashboardMetrics(portfolio);

  const pnlDirection =
    metrics.totalPnl === null || metrics.totalPnl === 0
      ? null
      : metrics.totalPnl > 0
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
        value={formatCurrency(metrics.totalValue)}
      />
      <MetricCard
        label="Cost Basis"
        value={formatCurrency(metrics.totalCostBasis)}
      />
      <MetricCard
        label="Total P&L"
        value={formatPnL(metrics.totalPnl)}
        variant="pnl"
        pnlDirection={pnlDirection}
      />
      <MetricCard
        label="IRR"
        value={formatIRR(metrics.irr)}
        variant="pnl"
        pnlDirection={irrDirection}
      />
      <MetricCard
        label="Cash Returned"
        value={formatCurrency(metrics.totalCashReturned)}
      />
    </div>
  );
}
