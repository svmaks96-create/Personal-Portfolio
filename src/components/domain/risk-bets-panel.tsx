import { getRiskPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import { ClusterNameForm } from "@/components/domain/cluster-name-form";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskBetsPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

function toneClass(tone: string | null): string {
  if (tone === "warn") return "text-[var(--warn)]";
  return "text-muted-foreground";
}

export async function RiskBetsPanel({
  portfolio,
  universe,
  window,
}: RiskBetsPanelProps) {
  const data = getRiskPageData(portfolio, universe, window);

  return (
    <TerminalPanel label="EFFECTIVE BETS" tag="WHAT THE BOOK REALLY HOLDS">
      {data.betsLensTable.rows.length === 0 ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          No covariance estimate for this universe and window.
        </p>
      ) : (
        <>
          <AnalyticsMetricTable table={data.betsLensTable} rowHeader="Lens" />

          <div className="mt-4">
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              Clusters · merged while avg ρ ≥ {data.clusterThreshold.toFixed(2)} ·
              name them yourself
            </div>
            <div className="space-y-2">
              {data.clusters.map((cluster) => (
                <div
                  key={cluster.members.join(",")}
                  className="flex items-center justify-between gap-3 border border-line-soft px-2.5 py-1.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2 font-mono text-[11px]">
                      <span className="text-foreground">
                        {cluster.members.join(" · ")}
                      </span>
                    </div>
                    <div className="mt-0.5 flex gap-3 font-mono text-[10px]">
                      <span className="text-muted-foreground">
                        {cluster.weight.display} of universe
                      </span>
                      <span className={toneClass(cluster.internalCorrelation.tone)}>
                        {cluster.internalCorrelation.display}
                      </span>
                    </div>
                  </div>
                  <ClusterNameForm
                    members={cluster.members}
                    currentName={cluster.name}
                  />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </TerminalPanel>
  );
}
