import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";

interface AnalyticsDrawdownPanelProps {
  portfolio?: string;
}

export async function AnalyticsDrawdownPanel({
  portfolio,
}: AnalyticsDrawdownPanelProps) {
  const data = getAnalyticsPageData(portfolio);
  const { rows, summary, current } = data.drawdowns;

  return (
    <TerminalPanel label="DRAWDOWNS" tag={`CURRENT ${current.display}`}>
      {rows.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          No drawdowns recorded.
        </p>
      ) : (
        <>
          <div className="space-y-2.5">
            {rows.map((row) => (
              <div key={`${row.peakDate}-${row.troughDate}`}>
                <div className="flex items-baseline justify-between font-mono text-[11px]">
                  <span className="tabular-nums text-muted-foreground">
                    {row.peakDate} → {row.troughDate}
                  </span>
                  <span className="tabular-nums font-semibold text-neg">
                    {row.depth.display}
                  </span>
                </div>
                <div className="mt-1 h-2 w-full bg-line">
                  <div
                    className="h-full bg-neg"
                    style={{
                      width: `${Math.min(100, Math.abs(row.depth.value ?? 0) * 2.5)}%`,
                    }}
                  />
                </div>
                <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  {row.daysDown}d down ·{" "}
                  {row.isOpen ? (
                    <span className="text-[var(--warn)]">still under water</span>
                  ) : (
                    `${row.daysToRecover}d to recover`
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
            {summary}
          </p>
        </>
      )}
    </TerminalPanel>
  );
}
