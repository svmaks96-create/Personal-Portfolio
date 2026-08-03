import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";

interface AnalyticsKpisProps {
  portfolio?: string;
  analysisWindow: AnalyticsWindow;
}

export async function AnalyticsKpis({ portfolio, analysisWindow }: AnalyticsKpisProps) {
  const data = getAnalyticsPageData(portfolio, analysisWindow);

  const cells: TerminalKpiCell[] = data.kpis.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    valueTone: kpi.tone,
    privateValue: kpi.isPrivate,
    sub: kpi.sub,
  }));

  return <TerminalKpiStrip cells={cells} columns={5} />;
}
