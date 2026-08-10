import { getRiskPageData } from "@/server/queries/risk-page";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskCaveatsPanelProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

/** Estimation honesty block — always visible, never behind a toggle. */
export async function RiskCaveatsPanel({
  portfolio,
  universe,
  window,
}: RiskCaveatsPanelProps) {
  const data = getRiskPageData(portfolio, universe, window);
  if (data.caveats.length === 0) return null;

  return (
    <div className="border border-line bg-panel px-3.5 py-2.5">
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
        Estimation notes
      </div>
      <ul className="space-y-1">
        {data.caveats.map((caveat) => (
          <li
            key={caveat}
            className="font-mono text-[10px] leading-relaxed text-muted-foreground"
          >
            · {caveat}
          </li>
        ))}
      </ul>
    </div>
  );
}
