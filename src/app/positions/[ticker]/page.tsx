import Link from "next/link";
import { EmptyState } from "@/components/domain/empty-state";
import { ControlsBar } from "@/components/domain/controls-bar";
import { PositionDetailHeader } from "@/components/domain/position-detail-header";
import { PositionHeroStrip } from "@/components/domain/position-hero-strip";
import { PositionStatsGrid } from "@/components/domain/position-stats-grid";
import { PositionPriceChart } from "@/components/domain/position-price-chart";
import { PositionFundamentalsPanel } from "@/components/domain/position-fundamentals-panel";
import { PositionConcentrationPanel } from "@/components/domain/position-concentration-panel";
import { PositionTradeHistoryTable } from "@/components/domain/position-trade-history-table";
import { PositionNotesPlaceholder } from "@/components/domain/position-notes-placeholder";
import { PositionSwitcher } from "@/components/domain/position-switcher";
import { getPositionDetail } from "@/server/queries/position-detail";
import { getStalestMarketDate } from "@/server/queries/market-data";

interface PageProps {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PositionDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { ticker: rawTicker } = await params;
  const { portfolio } = await searchParams;
  const ticker = decodeURIComponent(rawTicker);
  const portfolioFilter =
    typeof portfolio === "string" ? portfolio : undefined;

  const detail = getPositionDetail(ticker);

  if (!detail) {
    const backHref = portfolioFilter
      ? `/positions?portfolio=${encodeURIComponent(portfolioFilter)}`
      : "/positions";
    return (
      <EmptyState
        message={`Position ${ticker} not found`}
        actionLabel="Back to positions"
        actionHref={backHref}
      />
    );
  }

  const timestamp = getStalestMarketDate();

  const breadcrumbHref = portfolioFilter
    ? `/positions?portfolio=${encodeURIComponent(portfolioFilter)}`
    : "/positions";

  // Trades the chart can mark — buys and sells only (dividends carry no price).
  const chartTrades = detail.trades
    .filter(
      (t): t is typeof t & { qty: number; price: number } =>
        (t.action === "buy" || t.action === "sell") &&
        t.qty !== null &&
        t.price !== null,
    )
    .map((t) => ({
      date: t.date,
      action: t.action as "buy" | "sell",
      qty: t.qty,
      price: t.price,
    }));

  const history = {
    dates: detail.priceHistory.map((p) => p.date),
    prices: detail.priceHistory.map((p) => p.value),
  };

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <PositionSwitcher
        ticker={detail.ticker}
        allTickers={detail.allTickers}
        prevTicker={detail.prevTicker}
        nextTicker={detail.nextTicker}
      />

      <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <Link href={breadcrumbHref} className="hover:text-foreground">
          Positions
        </Link>
        <span className="opacity-50">/</span>
        <span className="text-muted-foreground">
          {(detail.portfolio ?? "All portfolios").toUpperCase()}
        </span>
        <span className="opacity-50">/</span>
        <span className="text-foreground">{detail.ticker}</span>
      </div>

      <ControlsBar timestamp={timestamp} />

      <PositionDetailHeader
        ticker={detail.ticker}
        companyName={detail.companyName}
        isActive={detail.isActive}
        isEtf={detail.isEtf}
        heldSince={detail.heldSince}
      />

      <PositionHeroStrip
        lastPrice={detail.position.lastPrice}
        currency={detail.currency}
        dayChange={detail.dayChange}
        sparkData={detail.sparkData}
        range52w={detail.range52w}
      />

      <PositionStatsGrid
        shares={detail.position.sharesHeld}
        avgEntry={detail.position.avgEntryPrice}
        costBasis={detail.position.costBasis}
        marketValue={detail.position.marketValue}
        weight={detail.position.weight}
        unrealizedPnl={detail.position.unrealizedPnl}
        realizedPnl={detail.position.realizedPnl}
        irr={detail.position.irr}
        yieldOnCost={detail.yieldOnCost}
        totalDividends={detail.position.totalDividends}
        holdingYears={detail.holdingYears}
        annualIncome={detail.annualIncome}
      />

      <div className="grid grid-cols-[2fr_1fr] gap-4">
        <div className="flex flex-col border border-line bg-panel">
          <div className="flex items-center justify-between border-b border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            <div>
              [ PRICE / TRADE OVERLAY ]
              <span className="ml-2 text-foreground">
                {chartTrades.length} TRADE{chartTrades.length === 1 ? "" : "S"}
              </span>
            </div>
            <div>{detail.priceHistory.length} POINTS</div>
          </div>
          <div className="p-3.5">
            <PositionPriceChart
              history={history}
              trades={chartTrades}
              avgEntry={detail.position.avgEntryPrice}
              currency={detail.currency}
              height={300}
            />
            <div className="mt-3 flex flex-wrap gap-5 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 bg-pos" /> Buy
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 bg-neg" /> Sell
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-[1px] w-3 bg-muted-foreground" />
                Avg entry
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <PositionFundamentalsPanel />
          <PositionConcentrationPanel
            direct={detail.concentration.direct}
            etf={detail.concentration.etf}
            total={detail.concentration.total}
          />
        </div>
      </div>

      <PositionTradeHistoryTable
        trades={detail.trades}
        currency={detail.currency}
      />

      <PositionNotesPlaceholder ticker={detail.ticker} />
    </div>
  );
}
