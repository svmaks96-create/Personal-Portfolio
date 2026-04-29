import { cn } from "@/lib/utils";
import {
  formatAmount,
  formatCurrency,
  formatDate,
  formatShares,
} from "@/lib/formatting";
import type { PositionTradeEvent } from "@/server/queries/position-detail";

interface PositionTradeHistoryTableProps {
  trades: PositionTradeEvent[];
  currency: string;
}

function actionMeta(action: PositionTradeEvent["action"]) {
  switch (action) {
    case "buy":
      return { label: "BUY", className: "border-pos text-pos" };
    case "sell":
      return { label: "SELL", className: "border-neg text-neg" };
    case "dividend":
      return { label: "DIV", className: "border-line text-muted-foreground" };
  }
}

const DASH = "—";

export function PositionTradeHistoryTable({
  trades,
  currency,
}: PositionTradeHistoryTableProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <div>
          [ TRADE HISTORY · {trades.length} EVENT{trades.length === 1 ? "" : "S"} ]
        </div>
        <div>{currency}</div>
      </div>
      {trades.length === 0 ? (
        <div className="px-3.5 py-6 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
          No transactions recorded
        </div>
      ) : (
        <table className="w-full table-fixed font-mono tabular-nums">
          <thead>
            <tr className="border-b border-line bg-panel-strong text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              <th className="px-3.5 py-2 text-left font-normal w-[14%]">Date</th>
              <th className="px-3.5 py-2 text-left font-normal w-[10%]">Action</th>
              <th className="px-3.5 py-2 text-right font-normal w-[12%]">Qty</th>
              <th className="px-3.5 py-2 text-right font-normal w-[14%]">Price</th>
              <th className="px-3.5 py-2 text-right font-normal w-[16%]">Gross</th>
              <th className="px-3.5 py-2 text-left font-normal w-[14%]">Portfolio</th>
              <th className="px-3.5 py-2 text-right font-normal w-[20%]">
                Running basis
              </th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const meta = actionMeta(t.action);
              const showRunning = t.runningShares !== null;
              const runningSummary = showRunning
                ? t.runningAvgCost !== null && t.runningShares! > 0
                  ? `${formatShares(t.runningShares)} sh · ${formatCurrency(
                      t.runningAvgCost,
                    )}`
                  : `${formatShares(t.runningShares)} sh`
                : DASH;
              return (
                <tr
                  key={t.id}
                  className="border-b border-line text-[12px] text-foreground last:border-b-0"
                >
                  <td className="px-3.5 py-[7px]">{formatDate(t.date)}</td>
                  <td className="px-3.5 py-[7px]">
                    <span
                      className={cn(
                        "inline-block border px-2 py-[1px] text-[10px] uppercase tracking-[0.18em]",
                        meta.className,
                      )}
                    >
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {t.qty !== null ? formatShares(t.qty) : DASH}
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {t.price !== null ? formatAmount(t.price) : DASH}
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {t.gross !== null ? formatAmount(t.gross) : DASH}
                  </td>
                  <td className="px-3.5 py-[7px] text-left text-muted-foreground">
                    {t.portfolio}
                  </td>
                  <td className="px-3.5 py-[7px] text-right text-muted-foreground">
                    {runningSummary}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
