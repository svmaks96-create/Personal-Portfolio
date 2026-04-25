import { TerminalPanel } from "@/components/domain/terminal-panel";
import { formatPercentDetailed } from "@/lib/formatting";
import type { ConcentrationData } from "@/server/types/concentration";

interface ConcentrationChartProps {
  data: ConcentrationData;
}

function buildTooltip(
  sources: { type: "direct" | "etf"; etfTicker?: string; weight: number }[]
): string {
  return sources
    .map((s) =>
      s.type === "direct"
        ? `Direct: ${formatPercentDetailed(s.weight)}`
        : `via ${s.etfTicker}: ${formatPercentDetailed(s.weight)}`
    )
    .join(" · ");
}

export function ConcentrationChart({ data }: ConcentrationChartProps) {
  const holdings = data.holdings
    .filter((h) => h.ticker !== "Other")
    .slice(0, 15);

  if (holdings.length === 0) {
    return (
      <TerminalPanel label="CONCENTRATION" tag="TOP 15 · LOOK-THROUGH">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          No position data available.
        </p>
      </TerminalPanel>
    );
  }

  const maxWeight = Math.max(...holdings.map((h) => h.weight.value));

  return (
    <TerminalPanel
      label="CONCENTRATION"
      tag={`TOP ${holdings.length}${data.etfTickers.length > 0 ? " · LOOK-THROUGH" : ""}`}
    >
      <div className="mb-2 flex gap-4 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2.5 bg-pos" />
          Direct
        </span>
        {data.etfTickers.length > 0 && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2.5 bg-muted-foreground/55" />
            via ETF
          </span>
        )}
      </div>
      <div className="flex-1 space-y-2">
        {holdings.map((holding) => {
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
            <div key={holding.ticker} title={buildTooltip(holding.sources)}>
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="font-semibold tracking-tight text-foreground">
                  {holding.ticker}
                </span>
                <span className="tabular-nums text-muted-foreground">
                  {holding.weight.display}
                </span>
              </div>
              <div className="mt-1 flex h-2 w-full bg-line">
                {directBarWidth > 0 && (
                  <div
                    className="h-full bg-pos"
                    style={{ width: `${directBarWidth}%` }}
                  />
                )}
                {etfBarWidth > 0 && (
                  <div
                    className="h-full bg-muted-foreground/55"
                    style={{ width: `${etfBarWidth}%` }}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </TerminalPanel>
  );
}
