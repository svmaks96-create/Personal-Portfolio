import { getRiskPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";
import { RiskWhatIfForm } from "@/components/domain/risk-whatif-form";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskWhatIfPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
  whatIfFrom?: string;
  whatIfTo?: string;
  whatIfAmountUsd?: number;
}

export async function RiskWhatIfPanel({
  portfolio,
  universe,
  window,
  whatIfFrom,
  whatIfTo,
  whatIfAmountUsd,
}: RiskWhatIfPanelProps) {
  const data = getRiskPageData(
    portfolio,
    universe,
    window,
    whatIfFrom,
    whatIfTo,
    whatIfAmountUsd
  );

  return (
    <TerminalPanel label="WHAT-IF" tag="TRIM X, ADD Y">
      <RiskWhatIfForm
        tickers={data.whatIfTickers}
        currentFrom={whatIfFrom}
        currentTo={whatIfTo}
        currentAmountUsd={whatIfAmountUsd}
      />

      {data.whatIf !== null ? (
        <div className="mt-3 border-t border-line-soft pt-3">
          <div className="mb-1.5 font-mono text-[10px] text-muted-foreground">
            {data.whatIf.moved}
          </div>
          <AnalyticsMetricTable table={data.whatIf.rows} rowHeader="Measure" />
          <p className="mt-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
            Model quantities under the shrunk covariance — a framing aid, not a
            recommendation.
          </p>
        </div>
      ) : (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Pick a name to trim, a name to add to, and an amount. The scenario is
          computed server-side from the same covariance as everything else.
        </p>
      )}
    </TerminalPanel>
  );
}
