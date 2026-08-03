import { cn } from "@/lib/utils";
import type { Cell, Table } from "@/server/queries/analytics-page";

function toneClass(tone: Cell["tone"]): string {
  if (tone === "pos") return "text-pos";
  if (tone === "neg") return "text-neg";
  if (tone === "warn") return "text-[var(--warn)]";
  if (tone === "muted") return "text-muted-foreground";
  return "text-foreground";
}

interface AnalyticsMetricTableProps {
  table: Table;
  /** Header for the leftmost (label) column. */
  rowHeader?: string;
  /** Emphasise the final row — used for totals and the "actual" comparison. */
  highlightLastRow?: boolean;
  className?: string;
}

/**
 * Renders a `Table` view model. Deliberately dumb: every value arrives already
 * formatted and already toned, because sign conventions on this page are not
 * obvious — a lower drawdown is worse, and positive exit "regret" means the
 * sale was a mistake — so they are decided once, server-side.
 */
export function AnalyticsMetricTable({
  table,
  rowHeader = "",
  highlightLastRow = false,
  className,
}: AnalyticsMetricTableProps) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
        <thead>
          <tr className="border-b border-line text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
            <th className="py-1.5 pr-3 text-left font-normal">{rowHeader}</th>
            {table.columns.map((column) => (
              <th key={column} className="py-1.5 pl-3 text-right font-normal">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => {
            const isLast = rowIndex === table.rows.length - 1;
            return (
              <tr
                key={row.label}
                className={cn(
                  "border-b border-line-soft last:border-b-0",
                  highlightLastRow && isLast && "border-t border-line font-semibold"
                )}
                title={row.hint}
              >
                <td className="py-1.5 pr-3 text-left text-muted-foreground">
                  {row.label}
                  {row.hint ? (
                    <span className="ml-1.5 text-[9px] uppercase tracking-[0.12em] text-[var(--warn)]">
                      modelled
                    </span>
                  ) : null}
                </td>
                {row.cells.map((cell, cellIndex) => (
                  <td
                    key={`${row.label}-${cellIndex}`}
                    className={cn("py-1.5 pl-3 text-right", toneClass(cell.tone))}
                  >
                    {cell.isPrivate ? (
                      <span className="demo-mask">{cell.display}</span>
                    ) : (
                      cell.display
                    )}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
