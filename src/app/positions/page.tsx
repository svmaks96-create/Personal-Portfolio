import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { DrillDownPositionsTable } from "@/components/domain/positions-table";
import {
  activePositionsColumns,
  closedPositionsColumns,
  ActivePositionsTotalsRow,
  ClosedPositionsTotalsRow,
} from "@/components/domain/positions-columns";
import { TerminalHeading } from "@/components/domain/terminal-heading";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";
import { TerminalSectionHeading } from "@/components/domain/terminal-section-heading";
import { getTransactionCount } from "@/server/queries/transactions";
import { getActivePositions, getClosedPositions } from "@/server/queries/positions";
import { getStalestMarketDate } from "@/server/queries/market-data";
import {
  formatCurrencyRounded,
  formatPercent,
  formatPnLRounded,
} from "@/lib/formatting";
import { pnlDirection } from "@/lib/pnl";
import type { KpiTone } from "@/components/domain/terminal-kpi-strip";
import { cn } from "@/lib/utils";

function toTone(value: number | null | undefined): KpiTone {
  const direction = pnlDirection(value ?? null);
  if (direction === "positive") return "pos";
  if (direction === "negative") return "neg";
  return null;
}

export default async function PositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const count = getTransactionCount();

  if (count === 0) {
    return <EmptyState message="No positions yet" />;
  }

  const { portfolio } = await searchParams;
  const portfolioFilter =
    typeof portfolio === "string" ? portfolio : undefined;

  const { rows: activeRows, totals: activeTotals } = getActivePositions(portfolioFilter);
  const { rows: closedRows, totals: closedTotals } = getClosedPositions(portfolioFilter);
  const timestamp = getStalestMarketDate();

  const emptyMessage = portfolioFilter
    ? `No positions in ${portfolioFilter}`
    : "No positions yet";

  // KPI cell values --------------------------------------------------------
  const activeCount = activeRows.length;
  const closedCount = closedRows.length;

  const totalMarketValueDisplay = activeTotals
    ? formatCurrencyRounded(activeTotals.marketValue.value)
    : "—";

  // Closed positions have unrealizedPnl = 0 by construction, so the
  // unrealized total equals the active-side sum. We still surface "—" when
  // there are no active rows to mirror the original empty state.
  const unrealizedPnlValue = activeTotals?.unrealizedPnl.value ?? null;
  const unrealizedPnlDisplay = activeTotals
    ? formatPnLRounded(unrealizedPnlValue)
    : "—";
  const unrealizedOnCost =
    activeTotals &&
    unrealizedPnlValue !== null &&
    activeTotals.costBasis.value !== null &&
    activeTotals.costBasis.value > 0
      ? (unrealizedPnlValue / activeTotals.costBasis.value) * 100
      : null;
  const unrealizedSub =
    unrealizedOnCost !== null ? `${formatPercent(unrealizedOnCost)} on cost` : "—";

  // Realized P&L spans active rows (dividends + completed sells inside
  // still-open holdings) *and* fully-closed positions. Summing only closed
  // would drop the realized portion of active rows. Match the dashboard's
  // strict null propagation: if either side has an N/A row the total is
  // N/A — coalescing to zero would silently understate the figure.
  const activeRealized = activeTotals?.realizedPnl.value ?? null;
  const closedRealized = closedTotals?.realizedPnl.value ?? null;
  const realizedPoisoned =
    (activeTotals !== null && activeRealized === null) ||
    (closedTotals !== null && closedRealized === null);
  const realizedPnlValue =
    activeTotals === null && closedTotals === null
      ? null
      : realizedPoisoned
        ? null
        : (activeRealized ?? 0) + (closedRealized ?? 0);
  const realizedPnlDisplay =
    activeTotals || closedTotals ? formatPnLRounded(realizedPnlValue) : "—";

  const activeDividends = activeTotals?.dividends.value ?? null;
  const closedDividends = closedTotals?.dividends.value ?? null;
  const totalDividends =
    activeDividends === null && closedDividends === null
      ? null
      : (activeDividends ?? 0) + (closedDividends ?? 0);

  const kpiCells: TerminalKpiCell[] = [
    {
      label: "Active Positions",
      value: String(activeCount),
      sub: `Total market value ${totalMarketValueDisplay}`,
      privateSub: true,
    },
    {
      label: "Unrealized P&L",
      value: unrealizedPnlDisplay,
      valueTone: toTone(unrealizedPnlValue),
      privateValue: true,
      sub: unrealizedSub,
    },
    {
      label: "Realized P&L",
      value: realizedPnlDisplay,
      valueTone: toTone(realizedPnlValue),
      privateValue: true,
      sub: "Lifetime",
    },
    {
      label: "Dividends Collected",
      value: formatCurrencyRounded(totalDividends),
      privateValue: true,
      sub: "Lifetime",
    },
  ];

  const pills = ["All", "Stocks", "ETFs", "Gainers", "Losers"];

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading
        section="POSITIONS"
        portfolio={portfolioFilter}
        right={`Active ${activeCount} · Closed ${closedCount}`}
      />
      <ControlsBar timestamp={timestamp} />
      <TerminalKpiStrip cells={kpiCells} columns={4} />

      <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span className="mr-1">Filter:</span>
        {pills.map((pill) => (
          <span
            key={pill}
            className={cn(
              "cursor-default border px-3 py-[5px]",
              pill === "All"
                ? "border-foreground bg-foreground text-background"
                : "border-line",
            )}
          >
            {pill}
          </span>
        ))}
      </div>

      <TerminalSectionHeading
        label="Active Positions"
        tag={`${activeCount} HOLDINGS`}
        hint="Sorted by market value"
      />
      <DrillDownPositionsTable
        data={activeRows}
        columns={activePositionsColumns}
        defaultSort={[{ id: "marketValue", desc: true }]}
        emptyMessage={emptyMessage}
        totalsRow={
          activeTotals ? <ActivePositionsTotalsRow totals={activeTotals} /> : undefined
        }
      />

      {closedRows.length > 0 && (
        <>
          <TerminalSectionHeading
            label="Closed Positions"
            tag={`${closedCount} REALIZED`}
            hint="Sorted by realized P&L"
          />
          <DrillDownPositionsTable
            data={closedRows}
            columns={closedPositionsColumns}
            defaultSort={[{ id: "realizedPnl", desc: true }]}
            totalsRow={
              closedTotals ? <ClosedPositionsTotalsRow totals={closedTotals} /> : undefined
            }
          />
        </>
      )}
    </div>
  );
}
