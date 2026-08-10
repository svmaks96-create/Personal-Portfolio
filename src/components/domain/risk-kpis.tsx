import { getRiskPageData } from "@/server/queries/risk-page";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";
import type { RiskUniverse, RiskWindow } from "@/shared/schemas/risk-view";

interface RiskKpisProps {
  portfolio?: string;
  universe: RiskUniverse;
  window: RiskWindow;
}

export async function RiskKpis({ portfolio, universe, window }: RiskKpisProps) {
  const data = getRiskPageData(portfolio, universe, window);

  const cells: TerminalKpiCell[] = data.headlines.map((headline) => ({
    label: headline.label,
    value: headline.value,
    valueTone: headline.tone,
    sub: headline.sub,
  }));

  return <TerminalKpiStrip cells={cells} columns={5} />;
}
