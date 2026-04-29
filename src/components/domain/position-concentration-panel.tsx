import { TerminalPanel } from "@/components/domain/terminal-panel";
import { formatPercentDetailed } from "@/lib/formatting";

interface PositionConcentrationPanelProps {
  direct: number;
  etf: number;
  total: number;
}

// Per-position bars are scaled against the largest single position weight in
// any portfolio (~25%), capped at 100%. This keeps a 2% holding visibly small
// without making a 12% holding overflow the bar.
const BAR_DENOMINATOR = 25;

function barWidth(weight: number): string {
  const pct = Math.min(100, Math.max(0, (weight / BAR_DENOMINATOR) * 100));
  return `${pct.toFixed(2)}%`;
}

export function PositionConcentrationPanel({
  direct,
  etf,
  total,
}: PositionConcentrationPanelProps) {
  const hasAny = total > 0;

  return (
    <TerminalPanel label="CONCENTRATION" className="flex-1">
      {hasAny ? (
        <div className="space-y-3">
          <div>
            <div className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-foreground">Direct holding</span>
              <span className="tabular-nums text-muted-foreground">
                {formatPercentDetailed(direct)}
              </span>
            </div>
            <div className="mt-1 h-2 w-full bg-line-soft">
              {direct > 0 && (
                <div className="h-full bg-pos" style={{ width: barWidth(direct) }} />
              )}
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between font-mono text-[11px]">
              <span className="text-foreground">Via ETFs (look-through)</span>
              <span className="tabular-nums text-muted-foreground">
                {formatPercentDetailed(etf)}
              </span>
            </div>
            <div className="mt-1 h-2 w-full bg-line-soft">
              {etf > 0 && (
                <div
                  className="h-full bg-muted-foreground/55"
                  style={{ width: barWidth(etf) }}
                />
              )}
            </div>
          </div>

          <div className="flex items-baseline justify-between border-t border-line pt-3 font-mono text-[12px] font-semibold">
            <span className="uppercase tracking-[0.16em] text-foreground">
              Total exposure
            </span>
            <span className="tabular-nums">{formatPercentDetailed(total)}</span>
          </div>

          <div className="flex gap-4 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2.5 bg-pos" /> Direct
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2.5 bg-muted-foreground/55" />
              via ETF
            </span>
          </div>
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          No portfolio exposure
        </p>
      )}
    </TerminalPanel>
  );
}
