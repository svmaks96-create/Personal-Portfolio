import { TerminalPanel } from "@/components/domain/terminal-panel";
import { formatCurrency, formatDate, formatPercentDetailed } from "@/lib/formatting";
import type { TickerDividend } from "@/server/queries/ticker-fundamentals";

interface PositionDividendSchedulePanelProps {
  dividends: TickerDividend[];
}

export function PositionDividendSchedulePanel({
  dividends,
}: PositionDividendSchedulePanelProps) {
  return (
    <TerminalPanel label="DIVIDEND HISTORY" className="flex-1">
      {dividends.length > 0 ? (
        <table className="w-full font-mono text-[11px] tabular-nums">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
              <th className="pb-2 text-left font-normal">Ex-date</th>
              <th className="pb-2 text-left font-normal">Pay date</th>
              <th className="pb-2 text-right font-normal">Amount</th>
              <th className="pb-2 text-right font-normal">Yield</th>
              <th className="pb-2 text-right font-normal">Freq</th>
            </tr>
          </thead>
          <tbody>
            {dividends.map((d) => (
              <tr key={d.id} className="border-t border-line-soft">
                <td className="py-1.5 text-left text-foreground">
                  {formatDate(d.exDate)}
                </td>
                <td className="py-1.5 text-left text-muted-foreground">
                  {d.paymentDate ? formatDate(d.paymentDate) : "—"}
                </td>
                <td className="py-1.5 text-right text-foreground">
                  {formatCurrency(d.dividend)}
                </td>
                <td className="py-1.5 text-right text-muted-foreground">
                  {d.yield === null ? "—" : formatPercentDetailed(d.yield)}
                </td>
                <td className="py-1.5 text-right text-muted-foreground">
                  {d.frequency ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          No dividend history
        </p>
      )}
    </TerminalPanel>
  );
}
