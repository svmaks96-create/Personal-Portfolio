import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";

interface AnalyticsContributionPanelProps {
  portfolio?: string;
}

/**
 * Contribution to *return* by sleeve, not dollars.
 *
 * Bars are drawn from a shared zero line because several sleeves contribute
 * negatively — the point of the panel is that a sleeve can make money in
 * dollars while costing return, by occupying weight that earned nothing.
 */
export async function AnalyticsContributionPanel({
  portfolio,
}: AnalyticsContributionPanelProps) {
  const data = getAnalyticsPageData(portfolio);
  const { bars, totalDisplay, conflictNote } = data.contribution;

  const magnitude = Math.max(...bars.map((b) => Math.abs(b.contributionPct)), 1);

  return (
    <TerminalPanel label="RETURN CONTRIBUTION" tag={`BY SLEEVE · TOTAL ${totalDisplay}`}>
      <div className="flex-1 space-y-2">
        {bars.map((bar) => {
          const width = (Math.abs(bar.contributionPct) / magnitude) * 50;
          const isNegative = bar.contributionPct < 0;
          return (
            <div key={bar.label}>
              <div className="flex items-baseline justify-between font-mono text-[11px]">
                <span className="tracking-tight text-foreground">{bar.label}</span>
                <span
                  className={`tabular-nums ${isNegative ? "text-neg" : "text-pos"}`}
                >
                  {bar.display}
                  <span className="ml-2 text-[9px] text-muted-foreground">
                    wt {bar.weightDisplay}
                  </span>
                </span>
              </div>
              <div className="mt-1 flex h-2 w-full">
                <div className="flex h-full w-1/2 justify-end bg-line">
                  {isNegative ? (
                    <div className="h-full bg-neg" style={{ width: `${width * 2}%` }} />
                  ) : null}
                </div>
                <div className="flex h-full w-1/2 justify-start bg-line">
                  {!isNegative ? (
                    <div className="h-full bg-pos" style={{ width: `${width * 2}%` }} />
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {conflictNote ? (
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {conflictNote}
        </p>
      ) : null}
    </TerminalPanel>
  );
}
