import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { DrillDownPositionsTable } from "@/components/domain/positions-table";
import {
  activePositionsColumns,
  closedPositionsColumns,
  ActivePositionsTotalsRow,
  ClosedPositionsTotalsRow,
} from "@/components/domain/positions-columns";
import { getTransactionCount } from "@/server/queries/transactions";
import { getActivePositions, getClosedPositions } from "@/server/queries/positions";
import { getStalestMarketDate } from "@/server/queries/market-data";

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

  return (
    <div className="space-y-8">
      <ControlsBar timestamp={timestamp} />
      <DrillDownPositionsTable
        data={activeRows}
        columns={activePositionsColumns}
        defaultSort={[{ id: "marketValue", desc: true }]}
        emptyMessage={emptyMessage}
        totalsRow={activeTotals ? <ActivePositionsTotalsRow totals={activeTotals} /> : undefined}
      />
      {closedRows.length > 0 && (
        <div>
          <h2 className="text-[16px] font-semibold text-foreground mb-4">
            Closed Positions
          </h2>
          <DrillDownPositionsTable
            data={closedRows}
            columns={closedPositionsColumns}
            defaultSort={[{ id: "realizedPnl", desc: true }]}
            totalsRow={closedTotals ? <ClosedPositionsTotalsRow totals={closedTotals} /> : undefined}
          />
        </div>
      )}
    </div>
  );
}
