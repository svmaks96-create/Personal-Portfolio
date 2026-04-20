import { getDashboardMetrics } from "@/server/queries/dashboard";
import { getPerformanceData } from "@/server/queries/performance";
import {
  formatCurrencyRounded,
  formatPercent,
  formatPnLRounded,
  formatIRRRounded,
} from "@/lib/formatting";
import { pnlDirection } from "@/lib/pnl";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/ui/sparkline";

interface DashboardMetricsProps {
  portfolio?: string;
}

interface KpiCellProps {
  label: string;
  value: string;
  valueTone?: "pos" | "neg" | null;
  sub?: string;
  subTone?: "pos" | "neg" | "muted";
  children?: React.ReactNode;
}

function toneClass(tone: "pos" | "neg" | null | undefined): string {
  if (tone === "pos") return "text-pos";
  if (tone === "neg") return "text-neg";
  return "text-foreground";
}

function subToneClass(tone: "pos" | "neg" | "muted" | undefined): string {
  if (tone === "pos") return "text-pos";
  if (tone === "neg") return "text-neg";
  return "text-muted-foreground";
}

function KpiCell({ label, value, valueTone, sub, subTone, children }: KpiCellProps) {
  return (
    <div className="flex flex-col gap-1.5 border-r border-line px-4 py-3.5 last:border-r-0">
      <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        <span className="mr-1 text-muted-foreground">▸</span>
        {label}
      </div>
      <div
        className={cn(
          "font-mono text-[22px] font-medium leading-none tabular-nums tracking-tight",
          toneClass(valueTone)
        )}
      >
        {value}
      </div>
      {sub ? (
        <div
          className={cn(
            "font-mono text-[10px] tracking-[0.05em]",
            subToneClass(subTone)
          )}
        >
          {sub}
        </div>
      ) : null}
      {children}
    </div>
  );
}

export async function DashboardMetrics({ portfolio }: DashboardMetricsProps) {
  const metrics = getDashboardMetrics(portfolio);
  const perf1M = getPerformanceData(portfolio, "1M");
  const sparkData = perf1M.portfolio.series.map((p) => p.growthOfDollar);

  const activePositions = metrics.positions.filter((p) => !p.isClosed).length;

  const unrealizedRatio =
    metrics.totalUnrealizedPnl !== null && metrics.totalCostBasis
      ? metrics.totalUnrealizedPnl / metrics.totalCostBasis
      : null;

  const unrealizedSub =
    unrealizedRatio !== null ? `${formatPercent(unrealizedRatio)} on cost` : "—";

  const sparkTone = pnlDirection(metrics.totalUnrealizedPnl);
  const sparkColor =
    sparkTone === "negative" ? "var(--neg)" : "var(--pos)";

  return (
    <div className="grid grid-cols-5 border border-line bg-panel">
      <KpiCell label="Total Value" value={formatCurrencyRounded(metrics.totalValue)}>
        {sparkData.length >= 2 ? (
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
        ) : null}
      </KpiCell>

      <KpiCell
        label="Cost Basis"
        value={formatCurrencyRounded(metrics.totalCostBasis)}
        sub={`${activePositions} position${activePositions === 1 ? "" : "s"}`}
      />

      <KpiCell
        label="Unrealized P&L"
        value={formatPnLRounded(metrics.totalUnrealizedPnl)}
        valueTone={
          pnlDirection(metrics.totalUnrealizedPnl) === "positive"
            ? "pos"
            : pnlDirection(metrics.totalUnrealizedPnl) === "negative"
              ? "neg"
              : null
        }
        sub={unrealizedSub}
      />

      <KpiCell
        label="Realized P&L"
        value={formatPnLRounded(metrics.totalRealizedPnl)}
        valueTone={
          pnlDirection(metrics.totalRealizedPnl) === "positive"
            ? "pos"
            : pnlDirection(metrics.totalRealizedPnl) === "negative"
              ? "neg"
              : null
        }
        sub="Lifetime"
      />

      <KpiCell
        label="Ann. MWRR"
        value={formatIRRRounded(metrics.irr)}
        valueTone={
          pnlDirection(metrics.irr) === "positive"
            ? "pos"
            : pnlDirection(metrics.irr) === "negative"
              ? "neg"
              : null
        }
        sub="Money-weighted"
      />
    </div>
  );
}
