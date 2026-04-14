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
      <Card className="bg-white shadow-sm ring-0">
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
    <Card className="bg-white shadow-sm ring-0">
      <CardHeader>
        <CardTitle>Portfolio Concentration</CardTitle>
        {data.etfTickers.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Look-through applied for: {data.etfTickers.join(", ")}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {data.holdings.map((holding) => {
            const barWidth =
              maxWeight > 0
                ? (holding.weight.value / maxWeight) * 100
                : 0;
            const isOther = holding.ticker === "Other";

            return (
              <div
                key={holding.ticker}
                className="flex items-center gap-3"
                title={isOther ? undefined : buildTooltip(holding.sources)}
              >
                <span className="w-16 shrink-0 text-right text-xs font-medium text-foreground truncate">
                  {holding.ticker}
                </span>
                <div className="flex-1 h-5 bg-muted/40 rounded-sm overflow-hidden">
                  <div
                    className={`h-full rounded-sm ${isOther ? "bg-zinc-400" : "bg-blue-500"}`}
                    style={{ width: `${barWidth}%` }}
                  />
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
