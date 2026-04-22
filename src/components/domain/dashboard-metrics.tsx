import { getDashboardMetrics } from "@/server/queries/dashboard";
import { getPerformanceData } from "@/server/queries/performance";
import {
  formatCurrencyRounded,
  formatPercent,
  formatPnLRounded,
  formatIRRRounded,
} from "@/lib/formatting";
import { pnlDirection } from "@/lib/pnl";
import { Sparkline } from "@/components/ui/sparkline";
import {
  TerminalKpiStrip,
  type KpiTone,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";

interface DashboardMetricsProps {
  portfolio?: string;
}

function toTone(value: number | null | undefined): KpiTone {
  const direction = pnlDirection(value ?? null);
  if (direction === "positive") return "pos";
  if (direction === "negative") return "neg";
  return null;
}

export async function DashboardMetrics({ portfolio }: DashboardMetricsProps) {
  const metrics = getDashboardMetrics(portfolio);
  const perf1M = getPerformanceData(portfolio, "1M");
  const sparkData = perf1M.portfolio.series.map((p) => p.growthOfDollar);

  const activePositions = metrics.positions.filter((p) => !p.isClosed).length;

  const unrealizedRatio =
    metrics.totalUnrealizedPnl !== null &&
    metrics.totalCostBasis !== null &&
    metrics.totalCostBasis > 0
      ? (metrics.totalUnrealizedPnl / metrics.totalCostBasis) * 100
      : null;

  const unrealizedSub =
    unrealizedRatio !== null ? `${formatPercent(unrealizedRatio)} on cost` : "—";

  const sparkTone = pnlDirection(metrics.totalUnrealizedPnl);
  const sparkColor = sparkTone === "negative" ? "var(--neg)" : "var(--pos)";

  const cells: TerminalKpiCell[] = [
    {
      label: "Total Value",
      value: formatCurrencyRounded(metrics.totalValue),
      privateValue: true,
      extra:
        sparkData.length >= 2 ? (
          <div className="mt-1">
            <Sparkline
              data={sparkData}
              width={160}
              height={24}
              color={sparkColor}
              fill
              className="w-full"
            />
          </div>
        ) : undefined,
    },
    {
      label: "Cost Basis",
      value: formatCurrencyRounded(metrics.totalCostBasis),
      privateValue: true,
      sub: `${activePositions} position${activePositions === 1 ? "" : "s"}`,
    },
    {
      label: "Unrealized P&L",
      value: formatPnLRounded(metrics.totalUnrealizedPnl),
      valueTone: toTone(metrics.totalUnrealizedPnl),
      privateValue: true,
      sub: unrealizedSub,
    },
    {
      label: "Realized P&L",
      value: formatPnLRounded(metrics.totalRealizedPnl),
      valueTone: toTone(metrics.totalRealizedPnl),
      privateValue: true,
      sub: "Lifetime",
    },
    {
      label: "Ann. MWRR",
      value: formatIRRRounded(metrics.irr),
      valueTone: toTone(metrics.irr),
      sub: "Money-weighted",
    },
  ];

  return <TerminalKpiStrip cells={cells} columns={5} />;
}
