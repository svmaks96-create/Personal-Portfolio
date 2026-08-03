import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import { AnalyticsWindowSelector } from "@/components/domain/analytics-window-selector";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";

interface AnalyticsWindowBarProps {
  portfolio?: string;
  window: AnalyticsWindow;
}

export async function AnalyticsWindowBar({
  portfolio,
  window,
}: AnalyticsWindowBarProps) {
  const data = getAnalyticsPageData(portfolio, window);
  const { meta } = data;

  return (
    <div className="flex items-center justify-between gap-4 border border-line bg-panel px-3.5 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-foreground">{meta.windowLabel}</span>
        <span className="mx-2">·</span>
        {meta.analysisFrom} → {meta.valuationAsOf}
        <span className="mx-2">·</span>
        {meta.episodeSummary}
        {meta.isWindowed ? (
          <>
            <span className="mx-2">·</span>
            <span className="text-[var(--warn)]">
              positions walked from {meta.inception}
            </span>
          </>
        ) : null}
      </div>
      <AnalyticsWindowSelector currentWindow={window} />
    </div>
  );
}
