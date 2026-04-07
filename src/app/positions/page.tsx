import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { DrillDownPositionsTable } from "@/components/domain/positions-table";
import { activePositionsColumns, closedPositionsColumns } from "@/components/domain/positions-columns";
import { getTransactionCount } from "@/server/queries/transactions";
import { getActivePositions, getClosedPositions } from "@/server/queries/positions";
import { getUniquePortfolios } from "@/server/queries/portfolios";
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

  const activePositions = getActivePositions(portfolioFilter);
  const closedPositions = getClosedPositions(portfolioFilter);
  const portfolios = getUniquePortfolios();
  const timestamp = getStalestMarketDate();

  const emptyMessage = portfolioFilter
    ? `No positions in ${portfolioFilter}`
    : "No positions yet";

  return (
    <div className="space-y-8">
      <ControlsBar
        portfolios={portfolios}
        selectedPortfolio={portfolioFilter}
        timestamp={timestamp}
      />
      <DrillDownPositionsTable
        data={activePositions}
        columns={activePositionsColumns}
        defaultSort={[{ id: "marketValue", desc: true }]}
        emptyMessage={emptyMessage}
      />
      {closedPositions.length > 0 && (
        <div>
          <h2 className="text-[16px] font-semibold text-zinc-900 mb-4">
            Closed Positions
          </h2>
          <DrillDownPositionsTable
            data={closedPositions}
            columns={closedPositionsColumns}
            defaultSort={[{ id: "realizedPnl", desc: true }]}
          />
        </div>
      )}
    </div>
  );
}
