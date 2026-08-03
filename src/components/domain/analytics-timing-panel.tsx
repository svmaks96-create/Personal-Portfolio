import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";

interface AnalyticsTimingPanelProps {
  portfolio?: string;
  analysisWindow: AnalyticsWindow;
}

export async function AnalyticsTimingPanel({ portfolio, analysisWindow }: AnalyticsTimingPanelProps) {
  const data = getAnalyticsPageData(portfolio, analysisWindow);

  return (
    <div className="grid grid-cols-2 gap-4">
      <TerminalPanel label="ENTRY QUALITY" tag="FILL VS MOVING AVERAGE">
        <div className="space-y-1.5">
          {data.entrySummary.map((row) => (
            <div
              key={row.label}
              className="flex items-baseline justify-between border-b border-line-soft pb-1.5 font-mono text-[11px] last:border-b-0"
            >
              <span className="text-muted-foreground">{row.label}</span>
              <span
                className={`tabular-nums ${
                  row.cells[0].tone === "pos"
                    ? "text-pos"
                    : row.cells[0].tone === "neg"
                      ? "text-neg"
                      : row.cells[0].tone === "muted"
                        ? "text-muted-foreground"
                        : "text-foreground"
                }`}
              >
                {row.cells[0].display}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Measured on the actual fill, not the day&apos;s close. Buys without 200
          days of prior history are absent from the moving-average figures rather
          than silently included.
        </p>
      </TerminalPanel>

      <TerminalPanel label="EXIT REGRET" tag="AFTER SELLING, VS SPY">
        <AnalyticsMetricTable table={data.exitTable} rowHeader="Horizon" />
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Positive excess means the sale was costly. Horizons running past the
          last available price are excluded, never truncated — truncating would
          bias long horizons toward recent trades. Watch the median against the
          mean: a few large misses can carry the average on their own.
        </p>
      </TerminalPanel>
    </div>
  );
}
