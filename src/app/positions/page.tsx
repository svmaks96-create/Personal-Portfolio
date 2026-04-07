import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { PositionsTable } from "@/components/domain/positions-table";
import { getTransactionCount } from "@/server/queries/transactions";
import { getActivePositions } from "@/server/queries/positions";
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

  const positions = getActivePositions(portfolioFilter);
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
      <PositionsTable data={positions} emptyMessage={emptyMessage} />
    </div>
  );
}
