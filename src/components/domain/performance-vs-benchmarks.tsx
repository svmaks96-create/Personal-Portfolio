import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricCard } from "@/components/domain/metric-card";
import { PerformanceChart } from "@/components/domain/performance-chart";
import { getPerformanceData } from "@/server/queries/performance";
import { formatIRRRounded } from "@/lib/formatting";
import { pnlDirection } from "@/lib/pnl";

interface PerformanceVsBenchmarksProps {
  portfolio?: string;
}

export async function PerformanceVsBenchmarks({
  portfolio,
}: PerformanceVsBenchmarksProps) {
  const data = getPerformanceData(portfolio);

  if (!data.hasTransactions) {
    return null;
  }

  return (
    <Card className="bg-card shadow-sm ring-0">
      <CardHeader>
        <CardTitle>Performance vs Benchmarks</CardTitle>
        <p className="text-xs text-muted-foreground">
          Time-weighted return (total-return basis, dividends reinvested) vs
          buy-and-hold of SPY and QQQ since the first transaction.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label={portfolio ? `${portfolio} TWRR` : "Portfolio TWRR"}
            value={formatIRRRounded(data.portfolio.cumulativeReturnPct)}
            variant="pnl"
            pnlDirection={pnlDirection(data.portfolio.cumulativeReturnPct)}
          />
          <MetricCard
            label="S&P 500 (SPY)"
            value={formatIRRRounded(data.spy.cumulativeReturnPct)}
            variant="pnl"
            pnlDirection={pnlDirection(data.spy.cumulativeReturnPct)}
          />
          <MetricCard
            label="Nasdaq-100 (QQQ)"
            value={formatIRRRounded(data.qqq.cumulativeReturnPct)}
            variant="pnl"
            pnlDirection={pnlDirection(data.qqq.cumulativeReturnPct)}
          />
        </div>

        {data.hasBenchmarkData ? (
          <PerformanceChart data={data.chartSeries} />
        ) : (
          <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground">
            Run <span className="font-medium text-foreground">Backfill history</span>{" "}
            to populate daily prices for the benchmark comparison chart.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
