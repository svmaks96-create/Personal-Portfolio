import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import type { AnalyticsWindow } from "@/shared/schemas/analytics-window";
import { TerminalPanel } from "@/components/domain/terminal-panel";
import { AnalyticsMetricTable } from "@/components/domain/analytics-metric-table";

interface AnalyticsCounterfactualPanelProps {
  portfolio?: string;
  analysisWindow: AnalyticsWindow;
}

export async function AnalyticsCounterfactualPanel({
  portfolio,
  analysisWindow,
}: AnalyticsCounterfactualPanelProps) {
  const data = getAnalyticsPageData(portfolio, analysisWindow);
  const { rows, alternatives } = data.counterfactual;

  return (
    <div className="space-y-4">
      <TerminalPanel label="IF TRADING HAD STOPPED" tag="FROZEN BOOK, HELD TO TODAY">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
            <thead>
              <tr className="border-b border-line text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
                <th className="py-1.5 pr-3 text-left font-normal">Freeze date</th>
                <th className="py-1.5 pl-3 text-right font-normal">Lines</th>
                <th className="py-1.5 pl-3 text-right font-normal">At freeze</th>
                <th className="py-1.5 pl-3 text-right font-normal">Today</th>
                <th className="py-1.5 pl-3 text-right font-normal">Frozen</th>
                <th className="py-1.5 pl-3 text-right font-normal">Actual</th>
                <th className="py-1.5 pl-3 text-right font-normal">Trading added</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.freezeDate}
                  className="border-b border-line-soft last:border-b-0"
                >
                  <td className="py-1.5 pr-3 text-left text-muted-foreground">
                    {row.freezeDate}
                  </td>
                  <td className="py-1.5 pl-3 text-right">{row.positions}</td>
                  <td className="py-1.5 pl-3 text-right">
                    <span className="demo-mask">{row.valueAtFreeze.display}</span>
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    <span className="demo-mask">{row.valueToday.display}</span>
                  </td>
                  <td className="py-1.5 pl-3 text-right">{row.frozenReturn.display}</td>
                  <td className="py-1.5 pl-3 text-right">{row.actualReturn.display}</td>
                  <td
                    className={`py-1.5 pl-3 text-right font-semibold ${
                      row.delta.tone === "pos"
                        ? "text-pos"
                        : row.delta.tone === "neg"
                          ? "text-neg"
                          : ""
                    }`}
                  >
                    {row.delta.display}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Compared on time-weighted return, which is insensitive to
          contributions — the real book took on large new capital after every
          freeze date and a frozen book takes none, so no contribution policy
          has to be invented.
        </p>
      </TerminalPanel>

      <TerminalPanel label="IF EVERY DOLLAR HAD GONE TO AN INDEX" tag="SAME COMMITMENT SCHEDULE">
        <AnalyticsMetricTable
          table={alternatives}
          rowHeader="Alternative"
          highlightLastRow
        />
        <p className="mt-3 border-t border-line-soft pt-2.5 font-mono text-[10px] leading-relaxed text-muted-foreground">
          Deposits are taken from the high-water mark of cumulative net
          invested, so the alternative only ever adds and never follows the
          investor into cash. The 60/40 row assumes a bond distribution yield
          rather than measuring one — a price-only bond leg would understate it
          by double digits.
        </p>
      </TerminalPanel>
    </div>
  );
}
