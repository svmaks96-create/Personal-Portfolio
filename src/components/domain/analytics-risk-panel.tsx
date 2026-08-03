import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";

interface AnalyticsRiskPanelProps {
  portfolio?: string;
  analysisWindow: AnalyticsWindow;
}

export async function AnalyticsRiskPanel({ portfolio, analysisWindow }: AnalyticsRiskPanelProps) {
  const data = getAnalyticsPageData(portfolio, analysisWindow);

  return (
    <TerminalPanel label="RISK" tag="VS BENCHMARKS">
      <AnalyticsMetricTable table={data.riskTable} rowHeader="Measure" />

      {data.robustWarning ? (
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-[var(--warn)]">
          {data.robustWarning}
        </p>
      ) : null}

      <div className="mt-4">
        <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
          Regression on each benchmark
        </div>
        <AnalyticsMetricTable table={data.benchmarkTable} rowHeader="Index" />
      </div>
    </TerminalPanel>
  );
}
