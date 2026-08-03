import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";

interface AnalyticsBehaviourPanelProps {
  portfolio?: string;
  analysisWindow: AnalyticsWindow;
}

export async function AnalyticsBehaviourPanel({
  portfolio,
  analysisWindow,
}: AnalyticsBehaviourPanelProps) {
  const data = getAnalyticsPageData(portfolio, analysisWindow);

  const cells: TerminalKpiCell[] = data.winLoss.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    valueTone: kpi.tone,
    privateValue: kpi.isPrivate,
    sub: kpi.sub,
  }));

  return (
    <div className="space-y-4">
      <TerminalKpiStrip cells={cells} columns={5} />

      <div className="grid grid-cols-2 gap-4">
        <TerminalPanel label="HOLDING PERIOD" tag="DAYS">
          <AnalyticsMetricTable table={data.holdingPeriodTable} rowHeader="Cohort" />
          <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Long-running winners are disproportionately still open, so excluding
            them shortens the winner distribution. Any gap between winners and
            losers is biased upward for that reason alone.
          </p>
        </TerminalPanel>

        <TerminalPanel label="AVERAGING" tag="HOW CAPITAL WAS ADDED">
          <AnalyticsMetricTable table={data.averagingTable} rowHeader="Cohort" />
          <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Return percentages divide by total capital deployed, so an episode
            with many adds carries a larger denominator. Compare the dollar
            columns before the percentage ones.
          </p>
        </TerminalPanel>
      </div>

      <TerminalPanel label="TURNOVER" tag="EX-TRANSFER · VS AVERAGE AUM">
        <AnalyticsMetricTable table={data.turnoverTable} rowHeader="Year" />
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Measured against average AUM rather than absolute dollars, and net of
          inter-broker transfers by matched notional — the book grew roughly
          300-fold, so gross traded says nothing on its own.
        </p>
      </TerminalPanel>
    </div>
  );
}
