import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import {
  TerminalKpiStrip,
  type TerminalKpiCell,
} from "@/components/domain/terminal-kpi-strip";

interface AnalyticsKpisProps {
  portfolio?: string;
}

export async function AnalyticsKpis({ portfolio }: AnalyticsKpisProps) {
  const data = getAnalyticsPageData(portfolio);

  const cells: TerminalKpiCell[] = data.kpis.map((kpi) => ({
    label: kpi.label,
    value: kpi.value,
    valueTone: kpi.tone,
    privateValue: kpi.isPrivate,
    sub: kpi.sub,
  }));

  return <TerminalKpiStrip cells={cells} columns={5} />;
}
