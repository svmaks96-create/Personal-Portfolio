import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";

interface AnalyticsRegimePanelProps {
  portfolio?: string;
  analysisWindow: AnalyticsWindow;
}

export async function AnalyticsRegimePanel({ portfolio, analysisWindow }: AnalyticsRegimePanelProps) {
  const data = getAnalyticsPageData(portfolio, analysisWindow);

  return (
    <TerminalPanel label="REGIMES" tag="BEFORE / AFTER THE PIVOT">
      <AnalyticsMetricTable table={data.regimeTable} rowHeader="Window" />
      <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
        Post-relocation starts 2025-12-10, when the book actually became a
        concentrated single-stock portfolio. Alpha and beta over that window
        describe the portfolio as it is held today, not as it was.
      </p>
    </TerminalPanel>
  );
}
