import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatCurrencyRounded,
  formatIRR,
  formatPercent,
  formatPercentDetailed,
  formatPnLRounded,
  formatShares,
} from "@/lib/formatting";
import { pnlColorClass } from "@/lib/pnl";

interface PositionStatsGridProps {
  shares: number | null;
  avgEntry: number | null;
  costBasis: number | null;
  marketValue: number | null;
  weight: number | null;
  unrealizedPnl: number | null;
  realizedPnl: number | null;
  irr: number | null;
  yieldOnCost: number | null;
  totalDividends: number | null;
  holdingYears: number | null;
  annualIncome: number | null;
}

interface Cell {
  label: string;
  value: string;
  valueClass?: string;
  sub?: string;
}

function formatHoldingYears(years: number | null): {
  value: string;
  sub: string;
} {
  if (years === null) return { value: "N/A", sub: "—" };
  if (years < 1 / 12) {
    return { value: "< 1 mo", sub: "Short-term" };
  }
  if (years < 1) {
    const months = Math.max(1, Math.round(years * 12));
    return { value: `${months} mo`, sub: "Short-term" };
  }
  return { value: `${years.toFixed(1)} yrs`, sub: "Long-term" };
}

export function PositionStatsGrid({
  shares,
  avgEntry,
  costBasis,
  marketValue,
  weight,
  unrealizedPnl,
  realizedPnl,
  irr,
  yieldOnCost,
  totalDividends,
  holdingYears,
  annualIncome,
}: PositionStatsGridProps) {
  const unrealizedOnCost =
    unrealizedPnl !== null && costBasis !== null && costBasis > 0
      ? (unrealizedPnl / costBasis) * 100
      : null;
  const heldFormatted = formatHoldingYears(holdingYears);

  const cells: Cell[] = [
    {
      label: "Shares held",
      value: formatShares(shares),
      sub: avgEntry !== null ? `@ avg ${formatCurrency(avgEntry)}` : "—",
    },
    {
      label: "Cost basis",
      value: formatCurrencyRounded(costBasis),
      sub: "Total invested",
    },
    {
      label: "Market value",
      value: formatCurrencyRounded(marketValue),
      sub:
        weight !== null
          ? `${formatPercentDetailed(weight)} of portfolio`
          : "—",
    },
    {
      label: "Unrealized P&L",
      value: formatPnLRounded(unrealizedPnl),
      valueClass: pnlColorClass(unrealizedPnl),
      sub:
        unrealizedOnCost !== null
          ? `${formatPercent(unrealizedOnCost)} on cost`
          : "—",
    },
    {
      label: "IRR (annualized)",
      value: formatIRR(irr),
      valueClass: pnlColorClass(irr),
      sub: "Money-weighted",
    },
    {
      label: "Yield on cost",
      value:
        yieldOnCost !== null
          ? formatPercentDetailed(yieldOnCost * 100)
          : "N/A",
      sub:
        totalDividends !== null && totalDividends > 0
          ? `${formatCurrencyRounded(totalDividends)} lifetime divs`
          : "No dividends",
    },
    {
      label: "Holding period",
      value: heldFormatted.value,
      sub: heldFormatted.sub,
    },
    {
      label: "Realized P&L",
      value: formatPnLRounded(realizedPnl),
      valueClass: pnlColorClass(realizedPnl),
      sub:
        annualIncome !== null
          ? `${formatCurrencyRounded(annualIncome)} divs · last 12mo`
          : "Sells + dividends",
    },
  ];

  return (
    <div className="grid grid-cols-4 border border-line bg-panel">
      {cells.map((c, i) => {
        const isLastCol = (i + 1) % 4 === 0;
        const isLastRow = i >= cells.length - 4;
        return (
          <div
            key={c.label}
            className={cn(
              "flex flex-col gap-1.5 px-4 py-3.5",
              !isLastCol && "border-r border-line",
              !isLastRow && "border-b border-line",
            )}
          >
            <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              <span className="mr-1">▸</span>
              {c.label}
            </div>
            <div
              className={cn(
                "font-mono text-[18px] font-medium leading-none tabular-nums tracking-tight text-foreground",
                c.valueClass,
              )}
            >
              {c.value}
            </div>
            {c.sub && (
              <div className="font-mono text-[11px] tracking-[0.05em] text-muted-foreground">
                {c.sub}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
