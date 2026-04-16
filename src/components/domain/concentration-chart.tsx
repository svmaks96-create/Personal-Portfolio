import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ConcentrationData } from "@/server/types/concentration";

interface ConcentrationChartProps {
  data: ConcentrationData;
}

function buildTooltip(sources: { type: "direct" | "etf"; etfTicker?: string; weight: number }[]): string {
  return sources
    .map((s) =>
      s.type === "direct"
        ? `Direct: ${s.weight.toFixed(1)}%`
        : `via ${s.etfTicker}: ${s.weight.toFixed(1)}%`
    )
    .join(" | ");
}

export function ConcentrationChart({ data }: ConcentrationChartProps) {
  if (data.holdings.length === 0) {
    return (
      <Card className="bg-card shadow-sm ring-0">
        <CardHeader>
          <CardTitle>Portfolio Concentration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No position data available.
          </p>
        </CardContent>
      </Card>
    );
  }

  const maxWeight = data.holdings[0].weight.value;

  return (
    <Card className="bg-card shadow-sm ring-0">
      <CardHeader>
        <CardTitle>Portfolio Concentration</CardTitle>
        {data.etfTickers.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">
              Look-through applied for: {data.etfTickers.join(", ")}
            </p>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-blue-500" />
                Direct
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-sky-300" />
                via ETF
              </span>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {data.holdings.map((holding) => {
            const isOther = holding.ticker === "Other";
            const directWeight = holding.sources
              .filter((s) => s.type === "direct")
              .reduce((sum, s) => sum + s.weight, 0);
            const etfWeight = holding.sources
              .filter((s) => s.type === "etf")
              .reduce((sum, s) => sum + s.weight, 0);
            const directBarWidth =
              maxWeight > 0 ? (directWeight / maxWeight) * 100 : 0;
            const etfBarWidth =
              maxWeight > 0 ? (etfWeight / maxWeight) * 100 : 0;

            return (
              <div
                key={holding.ticker}
                className="flex items-center gap-3"
                title={isOther ? undefined : buildTooltip(holding.sources)}
              >
                <span className="w-16 shrink-0 text-right text-xs font-medium text-foreground truncate">
                  {holding.ticker}
                </span>
                <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden flex">
                  {isOther ? (
                    <div
                      className="h-full bg-zinc-400"
                      style={{ width: `${(holding.weight.value / maxWeight) * 100}%` }}
                    />
                  ) : (
                    <>
                      {directBarWidth > 0 && (
                        <div
                          className="h-full bg-blue-500"
                          style={{ width: `${directBarWidth}%` }}
                        />
                      )}
                      {etfBarWidth > 0 && (
                        <div
                          className="h-full bg-sky-300"
                          style={{ width: `${etfBarWidth}%` }}
                        />
                      )}
                    </>
                  )}
                </div>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {holding.weight.display}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
