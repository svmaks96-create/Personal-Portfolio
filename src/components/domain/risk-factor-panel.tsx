import { getFactorPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskFactorPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

export async function RiskFactorPanel({
  portfolio,
  universe,
  window,
}: RiskFactorPanelProps) {
  const data = getFactorPageData(portfolio, universe, window);

  return (
    <TerminalPanel label="FACTOR DECOMPOSITION" tag="COULD ETFS HAVE DONE THIS">
      {!data.available ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          {data.notes[0]}
        </p>
      ) : (
        <>
          <div className="mb-3 font-mono text-[11px]">
            <span className="text-muted-foreground">
              Variance replicable with the four proxies:{" "}
            </span>
            <span
              className={
                data.replicable.tone === "warn"
                  ? "text-[var(--warn)]"
                  : "text-foreground"
              }
            >
              {data.replicable.display}
            </span>
          </div>

          <AnalyticsMetricTable table={data.loadingsTable} rowHeader="Factor" />

          <div className="mt-4">
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              Beta drift · first vs second half of the window
            </div>
            <AnalyticsMetricTable table={data.driftTable} rowHeader="Proxy" />
          </div>

          <div className="mt-3 space-y-1 border-t border-line-soft pt-2.5">
            {data.notes.map((note) => (
              <p
                key={note}
                className="font-mono text-[10px] leading-relaxed text-muted-foreground"
              >
                {note}
              </p>
            ))}
          </div>
        </>
      )}
    </TerminalPanel>
  );
}
