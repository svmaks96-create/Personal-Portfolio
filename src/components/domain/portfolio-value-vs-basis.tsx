import { TerminalPanel } from "@/components/domain/terminal-panel";
import { ValueVsBasisChart } from "@/components/domain/value-vs-basis-chart";
import { PeriodSelector } from "@/components/domain/period-selector";
import { Private } from "@/components/domain/private";
import { getValueHistoryData } from "@/server/queries/value-history";
import { formatCurrencyRounded } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { Period } from "@/shared/schemas/period";

interface PortfolioValueVsBasisProps {
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
      <span className="font-mono text-[11px] font-semibold tabular-nums text-foreground">
        <Private>{formatCurrencyRounded(value)}</Private>
      </span>
    </div>
  );
}

export async function PortfolioValueVsBasis({
  portfolio,
  period,
}: PortfolioValueVsBasisProps) {
  const data = getValueHistoryData(portfolio, period);

  if (!data.hasTransactions) return null;

  const last = data.series.at(-1) ?? null;
  const lastValue = last?.portfolioValue ?? null;
  const lastBasis = last?.costBasis ?? null;

  return (
    <TerminalPanel
      label="PORTFOLIO VALUE"
      tag="MARKET VALUE vs COST BASIS"
      action={<PeriodSelector currentPeriod={period} paramName="valuePeriod" />}
      className="min-h-[360px]"
      bodyClassName="p-0"
    >
      {data.series.length > 0 ? (
        <>
          <div className="flex-1 px-1 py-2">
            <ValueVsBasisChart data={data.series} />
          </div>
          <div className="flex flex-wrap gap-6 border-t border-line-soft px-3.5 py-3">
            <LegendItem
              label="Portfolio Value"
              value={lastValue}
              color="var(--chart-portfolio)"
            />
            <LegendItem
              label="Cost Basis"
              value={lastBasis}
              color="var(--chart-spy)"
              dashed
            />
          </div>
        </>
      ) : (
        <div className="m-3.5 flex flex-1 items-center justify-center rounded-sm border border-dashed border-line px-4 py-10 text-center font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
          Run backfill history to populate portfolio value chart
        </div>
      )}
    </TerminalPanel>
  );
}
