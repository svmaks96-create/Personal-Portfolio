import { getRiskPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import { VolDragCurve } from "@/components/domain/vol-drag-curve";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskVolDragPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

export async function RiskVolDragPanel({
  portfolio,
  universe,
  window,
}: RiskVolDragPanelProps) {
  const data = getRiskPageData(portfolio, universe, window);

  return (
    <TerminalPanel label="VOLATILITY DRAG" tag="COMPOUNDING COST">
      {data.dragCurve.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          No realized volatility available for this universe and window.
        </p>
      ) : (
        <>
          <VolDragCurve
            curve={data.dragCurve}
            currentVolPct={data.dragCurrentVolPct}
          />
          {data.dragReferenceTable.rows.length > 0 ? (
            <div className="mt-3">
              <AnalyticsMetricTable
                table={data.dragReferenceTable}
                rowHeader="If vol were…"
              />
            </div>
          ) : null}
        </>
      )}
    </TerminalPanel>
  );
}
