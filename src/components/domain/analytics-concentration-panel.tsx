import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";

interface AnalyticsConcentrationPanelProps {
  portfolio?: string;
}

export async function AnalyticsConcentrationPanel({
  portfolio,
}: AnalyticsConcentrationPanelProps) {
  const data = getAnalyticsPageData(portfolio);
  const { metrics, excludedNote } = data.concentration;

  return (
    <TerminalPanel label="CONCENTRATION" tag="TRAILING 252 DAYS">
      <div className="space-y-1.5">
        {metrics.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 border-b border-line-soft pb-1.5 font-mono text-[11px] last:border-b-0"
          >
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums text-foreground">
              {row.cells[0].display}
            </span>
          </div>
        ))}
      </div>
      {excludedNote ? (
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {excludedNote}
        </p>
      ) : null}
    </TerminalPanel>
  );
}
