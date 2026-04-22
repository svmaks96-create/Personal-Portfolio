import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { TransactionsTable } from "@/components/domain/transactions-table";
import { ActiveFilters } from "@/components/domain/active-filters";
import { TerminalHeading } from "@/components/domain/terminal-heading";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";
import { getTransactionCount, getTransactions } from "@/server/queries/transactions";
import { getStalestMarketDate } from "@/server/queries/market-data";
import { formatCurrencyRounded } from "@/lib/formatting";
import type { TransactionRow } from "@/server/queries/transactions";

interface TransactionSummary {
  buys: number;
  sells: number;
  dividends: number;
  buyNet: number;
  sellNet: number;
  divNet: number;
  tickers: number;
  portfolios: number;
}

function summarise(rows: TransactionRow[]): TransactionSummary {
  let buys = 0;
  let sells = 0;
  let dividends = 0;
  let buyNet = 0;
  let sellNet = 0;
  let divNet = 0;
  const tickers = new Set<string>();
  const portfolios = new Set<string>();

  for (const r of rows) {
    tickers.add(r.ticker);
    portfolios.add(r.portfolio);
    if (r.action === "buy") {
      buys += 1;
      buyNet += r.netAmount.value;
    } else if (r.action === "sell") {
      sells += 1;
      sellNet += r.netAmount.value;
    } else if (r.action === "dividend") {
      dividends += 1;
      divNet += r.netAmount.value;
    }
  }

  return {
    buys,
    sells,
    dividends,
    buyNet,
    sellNet,
    divNet,
    tickers: tickers.size,
    portfolios: portfolios.size,
  };
}

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
  const timestamp = getStalestMarketDate();

  const hasFilters = Boolean(portfolioFilter || tickerFilter);

  let emptyMessage = "No transactions yet";
  if (tickerFilter && portfolioFilter) {
    emptyMessage = `No transactions for ${tickerFilter} in ${portfolioFilter}`;
  } else if (tickerFilter) {
    emptyMessage = `No transactions for ${tickerFilter}`;
  } else if (portfolioFilter) {
    emptyMessage = `No transactions in ${portfolioFilter}`;
  }

  const summary = summarise(rows);

  const kpiCells: TerminalKpiCell[] = [
    {
      label: "Buys",
      value: String(summary.buys),
      sub: `Net out ${formatCurrencyRounded(summary.buyNet)}`,
      privateSub: true,
    },
    {
      label: "Sells",
      value: String(summary.sells),
      sub: `Net in ${formatCurrencyRounded(summary.sellNet)}`,
      privateSub: true,
    },
    {
      label: "Dividends",
      value: String(summary.dividends),
      valueTone: summary.dividends > 0 ? "pos" : null,
      sub: `Collected ${formatCurrencyRounded(summary.divNet)}`,
      privateSub: true,
    },
    {
      label: "Tickers",
      value: String(summary.tickers),
      sub: `Across ${summary.portfolios} portfolio${summary.portfolios === 1 ? "" : "s"}`,
    },
  ];

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading
        section="TRANSACTIONS"
        portfolio={portfolioFilter}
        showDate={false}
        right={`${rows.length} Records`}
      />
      <ControlsBar timestamp={timestamp} />
      <TerminalKpiStrip cells={kpiCells} columns={4} />
      <ActiveFilters ticker={tickerFilter} portfolio={portfolioFilter} />
      {rows.length === 0 && hasFilters ? (
        <EmptyState
          message={emptyMessage}
          actionLabel="Clear filters"
          actionHref="/transactions"
        />
      ) : (
        <TransactionsTable data={rows} />
      )}
    </div>
  );
}
