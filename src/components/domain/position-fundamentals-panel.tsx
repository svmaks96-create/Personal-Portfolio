import { TerminalPanel } from "@/components/domain/terminal-panel";
import { cn } from "@/lib/utils";

const ROWS = [
  { key: "Mkt Cap" },
  { key: "P/E TTM" },
  { key: "Fwd P/E" },
  { key: "EPS TTM" },
  { key: "Div Yield" },
  { key: "Beta" },
];

export function PositionFundamentalsPanel() {
  return (
    <TerminalPanel label="FUNDAMENTALS" className="flex-1">
      <div className="grid grid-cols-2">
        {ROWS.map((row, i) => {
          const isLastTwo = i >= ROWS.length - 2;
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
              <span className="text-muted-foreground">N/A</span>
            </div>
          );
        })}
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        FMP profile data not yet wired up
      </p>
    </TerminalPanel>
  );
}
