import { getFactorPageData } from "@/server/queries/risk-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";
import { cn } from "@/lib/utils";

interface RiskAlphaPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

function toneClass(tone: string | null): string {
  if (tone === "pos") return "text-pos";
  if (tone === "neg") return "text-neg";
  if (tone === "muted") return "text-muted-foreground";
  return "text-foreground";
}

/** The residual, stated honestly: point estimate, interval, verdict. */
export async function RiskAlphaPanel({
  portfolio,
  universe,
  window,
}: RiskAlphaPanelProps) {
  const data = getFactorPageData(portfolio, universe, window);

  return (
    <TerminalPanel label="RESIDUAL" tag="WHAT'S LEFT AFTER THE ETFS">
      {data.alpha === null ? (
        <p className="font-mono text-[11px] text-muted-foreground">
          No estimate available for this universe and window.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              Annualized alpha
            </div>
            <div
              className={cn(
                "font-mono text-[26px] font-medium leading-none tabular-nums",
                toneClass(data.alpha.value.tone)
              )}
            >
              {data.alpha.value.display}
            </div>
            <div className="mt-1.5 font-mono text-[10px] text-muted-foreground">
              {data.alpha.ci}
            </div>
          </div>
          <p
            className={cn(
              "border-t border-line-soft pt-2.5 font-mono text-[11px] leading-relaxed",
              toneClass(data.alpha.verdictTone)
            )}
          >
            {data.alpha.verdict}
          </p>
        </div>
      )}
    </TerminalPanel>
  );
}
