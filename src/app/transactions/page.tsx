import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { TransactionsTable } from "@/components/domain/transactions-table";
import { ActiveFilters } from "@/components/domain/active-filters";
import { getTransactionCount, getTransactions } from "@/server/queries/transactions";
import { getUniquePortfolios } from "@/server/queries/portfolios";
import { getStalestMarketDate } from "@/server/queries/market-data";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const count = getTransactionCount();

  if (count === 0) {
    return <EmptyState message="No transactions yet" />;
  }

  const { portfolio, ticker } = await searchParams;
  const portfolioFilter =
    typeof portfolio === "string" ? portfolio : undefined;
  const tickerFilter = typeof ticker === "string" ? ticker : undefined;

  const rows = getTransactions(portfolioFilter, tickerFilter);
  const portfolios = getUniquePortfolios();
  const timestamp = getStalestMarketDate();

  const hasFilters = Boolean(portfolioFilter || tickerFilter);

  // Build contextual empty message
  let emptyMessage = "No transactions yet";
  if (tickerFilter && portfolioFilter) {
    emptyMessage = `No transactions for ${tickerFilter} in ${portfolioFilter}`;
  } else if (tickerFilter) {
    emptyMessage = `No transactions for ${tickerFilter}`;
  } else if (portfolioFilter) {
    emptyMessage = `No transactions in ${portfolioFilter}`;
  }

  return (
    <div className="space-y-4">
      <ControlsBar
        portfolios={portfolios}
        selectedPortfolio={portfolioFilter}
        timestamp={timestamp}
      />
      <ActiveFilters ticker={tickerFilter} portfolio={portfolioFilter} />
      {rows.length === 0 && hasFilters ? (
        <EmptyState
          message={emptyMessage}
          actionLabel="Clear filters"
          actionHref="/transactions"
        />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">Amounts are in each transaction&apos;s respective currency</p>
          <TransactionsTable data={rows} />
        </>
      )}
    </div>
  );
}
