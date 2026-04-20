"use client";

import type { ImportValidationRow } from "@/server/types/import";
import { cn } from "@/lib/utils";
import { FIELD_COLUMNS, COLUMN_LABELS } from "@/shared/schemas/transaction-fields";

function getDuplicateSource(row: ImportValidationRow): string {
  if (!row.duplicateOf) return "";
  if (row.duplicateOf.source === "existing") return "Matches existing transaction";
  return `Matches row ${row.duplicateOf.batchRowIndex} in this file`;
}

const ROW_GRID =
  "grid-cols-[44px_56px_1fr_0.9fr_0.7fr_0.9fr_0.9fr_0.7fr_1fr_0.9fr_0.7fr_1.3fr]";

interface ImportDuplicateTableProps {
  duplicates: ImportValidationRow[];
  overriddenDuplicates: Set<number>;
  onToggleDuplicate: (rowIndex: number) => void;
}

function OverrideCheck({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[14px] w-[14px] items-center justify-center border",
        on
          ? "border-pos bg-pos text-background"
          : "border-line bg-background",
      )}
    >
      {on ? (
        <svg viewBox="0 0 10 10" className="h-[10px] w-[10px]">
          <path
            d="M2 5 L4 7 L8 3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
          />
        </svg>
      ) : null}
    </span>
  );
}

export function ImportDuplicateTable({
  duplicates,
  overriddenDuplicates,
  onToggleDuplicate,
}: ImportDuplicateTableProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1160px]">
        <div
          className={cn(
            "grid gap-2 border-b border-line bg-panel-strong px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground",
            ROW_GRID,
          )}
        >
          <div className="text-center">Import</div>
          <div className="text-center">Row</div>
          {FIELD_COLUMNS.map((field) => (
            <div key={field} className="text-center">
              {COLUMN_LABELS[field]}
            </div>
          ))}
          <div>Matches</div>
        </div>

        {duplicates.map((row) => {
          const on = overriddenDuplicates.has(row.rowIndex);
          return (
            <div
              key={row.rowIndex}
              className={cn(
                "grid items-center gap-2 border-b border-line bg-[var(--row-duplicate-bg)] px-3 py-[7px] font-mono text-[12px] tabular-nums",
                ROW_GRID,
              )}
            >
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => onToggleDuplicate(row.rowIndex)}
                  className="cursor-pointer"
                  aria-label={on ? "Skip duplicate" : "Override duplicate"}
                >
                  <OverrideCheck on={on} />
                </button>
              </div>
              <div className="text-center text-muted-foreground">
                {row.rowIndex}
              </div>
              {FIELD_COLUMNS.map((field) => (
                <div
                  key={field}
                  className={cn(
                    "min-w-0 truncate text-center",
                    !on && "line-through opacity-60",
                  )}
                >
                  {field === "ticker" ? (
                    <span className="font-semibold">
                      {String(row.data[field] ?? "")}
                    </span>
                  ) : (
                    String(row.data[field] ?? "")
                  )}
                </div>
              ))}
              <div className="truncate text-left text-[11px] text-muted-foreground">
                {getDuplicateSource(row)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
