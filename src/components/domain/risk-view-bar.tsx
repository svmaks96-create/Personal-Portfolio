import { getRiskPageData } from "@/server/queries/risk-page";
import { RiskViewSelector } from "@/components/domain/risk-view-selector";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskViewBarProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

export async function RiskViewBar({ portfolio, universe, window }: RiskViewBarProps) {
  const data = getRiskPageData(portfolio, universe, window);
  const { meta } = data;

  return (
    <div className="flex items-center justify-between gap-4 border border-line bg-panel px-3.5 py-2">
      <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
        <span className="text-foreground">{meta.universeLabel}</span>
        <span className="mx-2">·</span>
        {meta.windowLabel}
        {meta.estimationFrom !== null && meta.estimationTo !== null ? (
          <>
            <span className="mx-2">·</span>
            {meta.estimationFrom} → {meta.estimationTo}
          </>
        ) : null}
        <span className="mx-2">·</span>
        <span className={meta.observations.tone === "warn" ? "text-[var(--warn)]" : ""}>
          {meta.observations.display}
        </span>
        <span className="mx-2">·</span>
        {meta.shrinkage.display}
        {meta.shareOfBook.tone === "warn" ? (
          <>
            <span className="mx-2">·</span>
            <span className="text-[var(--warn)]">
              covers {meta.shareOfBook.display} of book
            </span>
          </>
        ) : null}
      </div>
      <RiskViewSelector currentUniverse={universe} currentWindow={window} />
    </div>
  );
}
