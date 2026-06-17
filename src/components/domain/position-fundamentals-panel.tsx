import { TerminalPanel } from "@/components/domain/terminal-panel";
import { cn } from "@/lib/utils";
import {
  formatCurrency,
  formatMarketCap,
  formatMultiple,
  formatPercentDetailed,
} from "@/lib/formatting";

interface PositionFundamentalsPanelProps {
  marketCap: number | null;
  peTtm: number | null;
  fwdPe: number | null;
  epsTtm: number | null;
  /** Fraction (e.g. 0.0035 = 0.35%). */
  divYieldTtm: number | null;
  beta: number | null;
  isEtf: boolean;
}

export function PositionFundamentalsPanel({
  marketCap,
  peTtm,
  fwdPe,
  epsTtm,
  divYieldTtm,
  beta,
  isEtf,
}: PositionFundamentalsPanelProps) {
  // ETFs have no earnings-based metrics.
  const earnings = (v: string) => (isEtf ? "N/A" : v);

  const rows = [
    { key: isEtf ? "AUM" : "Mkt Cap", value: formatMarketCap(marketCap) },
    { key: "P/E TTM", value: earnings(formatMultiple(peTtm)) },
    { key: "Fwd P/E", value: earnings(formatMultiple(fwdPe)) },
    { key: "EPS TTM", value: earnings(formatCurrency(epsTtm)) },
    {
      key: "Div Yield",
      value:
        divYieldTtm === null ? "N/A" : formatPercentDetailed(divYieldTtm * 100),
    },
    { key: "Beta", value: beta === null ? "N/A" : beta.toFixed(2) },
  ];

  return (
    <TerminalPanel label="FUNDAMENTALS" className="flex-1">
      <div className="grid grid-cols-2">
        {rows.map((row, i) => {
          const isLastTwo = i >= rows.length - 2;
          const isLeft = i % 2 === 0;
          return (
            <div
              key={row.key}
              className={cn(
                "flex items-baseline justify-between py-2 font-mono text-[12px]",
                !isLastTwo && "border-b border-line-soft",
                isLeft ? "border-r border-line-soft pr-3.5" : "pl-3.5",
              )}
            >
              <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {row.key}
              </span>
              <span
                className={
                  row.value === "N/A"
                    ? "text-muted-foreground"
                    : "tabular-nums text-foreground"
                }
              >
                {row.value}
              </span>
            </div>
          );
        })}
      </div>
    </TerminalPanel>
  );
}
