import { TerminalPanel } from "@/components/domain/terminal-panel";
import { PerformanceChart } from "@/components/domain/performance-chart";
import { PeriodSelector } from "@/components/domain/period-selector";
import { getPerformanceData } from "@/server/queries/performance";
import { formatIRRRounded } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { Period } from "@/shared/schemas/period";

interface PerformanceVsBenchmarksProps {
  portfolio?: string;
  period: Period;
}

interface LegendItemProps {
  label: string;
  value: number | null;
  color: string;
  dashed?: boolean;
}

function LegendItem({ label, value, color, dashed }: LegendItemProps) {
  const tone =
    value === null ? "text-muted-foreground" : value >= 0 ? "text-pos" : "text-neg";
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className={cn("inline-block h-[2px] w-4", dashed && "border-t border-dashed")}
        style={
          dashed
            ? { background: "transparent", borderColor: color }
            : { background: color }
        }
      />
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      <span className={cn("font-mono text-[11px] font-semibold tabular-nums", tone)}>
        {formatIRRRounded(value)}
      </span>
    </div>
  );
}

export async function PerformanceVsBenchmarks({
  portfolio,
  period,
}: PerformanceVsBenchmarksProps) {
  const data = getPerformanceData(portfolio, period);

  if (!data.hasTransactions) {
    return null;
  }

  return (
    <TerminalPanel
      label="PERFORMANCE"
      tag="PORTFOLIO vs SPY vs QQQ"
      action={<PeriodSelector currentPeriod={period} />}
      className="min-h-[420px]"
      bodyClassName="p-0"
    >
      {data.hasBenchmarkData ? (
        <>
          <div className="flex-1 px-1 py-2">
            <PerformanceChart data={data.chartSeries} />
          </div>
          <div className="flex flex-wrap gap-6 border-t border-line-soft px-3.5 py-3">
            <LegendItem
              label="Portfolio"
              value={data.portfolio.cumulativeReturnPct}
              color="var(--pos)"
            />
            <LegendItem
              label="SPY"
              value={data.spy.cumulativeReturnPct}
              color="var(--bench1)"
              dashed
            />
            <LegendItem
              label="QQQ"
              value={data.qqq.cumulativeReturnPct}
              color="var(--bench2)"
              dashed
            />
          </div>
        </>
      ) : (
        <div className="m-3.5 flex flex-1 items-center justify-center rounded-sm border border-dashed border-line px-4 py-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Run backfill history to populate benchmark comparison
        </div>
      )}
    </TerminalPanel>
  );
}
