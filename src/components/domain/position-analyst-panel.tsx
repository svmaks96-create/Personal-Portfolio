import { TerminalPanel } from "@/components/domain/terminal-panel";
import { RangeBar } from "@/components/domain/range-bar";
import { formatCurrency, formatPercent } from "@/lib/formatting";
import { pnlColorClass } from "@/lib/pnl";
import { cn } from "@/lib/utils";

interface PositionAnalystPanelProps {
  rating: string | null;
  /** Overall score, 1-5. */
  score: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  targetMedian: number | null;
  targetConsensus: number | null;
  currentPrice: number | null;
}

export function PositionAnalystPanel({
  rating,
  score,
  targetHigh,
  targetLow,
  targetMedian,
  targetConsensus,
  currentPrice,
}: PositionAnalystPanelProps) {
  const hasAny =
    rating !== null || targetConsensus !== null || targetHigh !== null;

  const upside =
    targetConsensus !== null && currentPrice !== null && currentPrice > 0
      ? targetConsensus / currentPrice - 1
      : null;
  const upsideDisplay =
    upside === null
      ? "N/A"
      : `${upside >= 0 ? "+" : ""}${formatPercent(upside * 100)}`;

  return (
    <TerminalPanel label="ANALYST" className="flex-1">
      {hasAny ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Rating
              </div>
              <div className="mt-1 font-mono text-[16px] font-medium text-foreground">
                {rating ?? "—"}
                {score !== null && (
                  <span className="ml-1 text-[11px] text-muted-foreground">
                    {score}/5
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Consensus
              </div>
              <div className="mt-1 font-mono text-[16px] font-medium tabular-nums text-foreground">
                {formatCurrency(targetConsensus)}
              </div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Upside
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-[16px] font-medium tabular-nums",
                  pnlColorClass(upside),
                )}
              >
                {upsideDisplay}
              </div>
            </div>
          </div>

          <div>
            <div className="mb-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              12-mo target range
            </div>
            <RangeBar
              low={targetLow}
              high={targetHigh}
              current={currentPrice}
              label="now"
              formatValue={(v) => formatCurrency(v)}
            />
            {targetMedian !== null && (
              <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
                Median {formatCurrency(targetMedian)}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          No analyst coverage
        </p>
      )}
    </TerminalPanel>
  );
}
