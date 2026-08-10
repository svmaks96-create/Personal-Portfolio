import { getScenarioPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import { RiskScenarioForm } from "@/components/domain/risk-scenario-form";
import type { RiskUniverse } from "@/shared/schemas/risk-view";

interface RiskScenarioPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
}

export async function RiskScenarioPanel({
  portfolio,
  universe,
}: RiskScenarioPanelProps) {
  const data = getScenarioPageData(portfolio, universe);

  return (
    <>
      <TerminalPanel label="SCENARIO REPLAY" tag="TODAY'S BOOK, PAST STORMS">
        {data.table.rows.length === 0 ? (
          <p className="font-mono text-[11px] text-muted-foreground">
            No replayable scenarios for this universe.
          </p>
        ) : (
          <>
            <AnalyticsMetricTable table={data.table} rowHeader="Episode" />

            {data.driverLines.length > 0 ? (
              <div className="mt-4">
                <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
                  Who drove the drawdown · contribution in portfolio pct points
                </div>
                <div className="space-y-1">
                  {data.driverLines.map((line) => (
                    <div
                      key={line.label}
                      className="flex justify-between gap-4 font-mono text-[10px]"
                    >
                      <span className="text-muted-foreground">{line.label}</span>
                      <span className="text-foreground">{line.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-3 space-y-1 border-t border-line-soft pt-2.5">
              {[...data.notes, ...data.exclusionNotes].map((note) => (
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
      <TerminalPanel label="CUSTOM WINDOWS" tag="ADD YOUR OWN">
        <RiskScenarioForm customWindows={data.customWindows} />
      </TerminalPanel>
    </>
  );
}
