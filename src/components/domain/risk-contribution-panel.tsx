import { getRiskPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskContributionPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

export async function RiskContributionPanel({
  portfolio,
  universe,
  window,
}: RiskContributionPanelProps) {
  const data = getRiskPageData(portfolio, universe, window);

  return (
    <TerminalPanel label="RISK CONTRIBUTION" tag="WHO RUNS THE BOOK">
      {data.contributionTable.rows.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          No decomposable positions in this universe and window.
        </p>
      ) : (
        <AnalyticsMetricTable table={data.contributionTable} rowHeader="Ticker" />
      )}

      {data.contributionNotes.length > 0 ? (
        <div className="mt-3 space-y-1 border-t border-line-soft pt-2.5">
          {data.contributionNotes.map((note) => (
            <p
              key={note}
              className="font-mono text-[10px] leading-relaxed text-muted-foreground"
            >
              {note}
            </p>
          ))}
        </div>
      ) : null}
    </TerminalPanel>
  );
}
