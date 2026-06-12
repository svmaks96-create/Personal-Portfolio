"use client";

import { Fragment, useState, useCallback } from "react";
import { EditableCell } from "@/components/domain/editable-cell";
import type { ImportValidationRow } from "@/server/types/import";
import { cn } from "@/lib/utils";
import {
  FIELD_COLUMNS,
  COLUMN_LABELS,
  ACTION_OPTIONS,
  INSTRUMENT_OPTIONS,
  type FieldKey,
} from "@/shared/schemas/transaction-fields";

const INPUT_TYPES: Record<FieldKey, "text" | "number" | "date" | "select"> = {
  date: "date",
  ticker: "text",
  action: "select",
  instrument: "select",
  quantity: "number",
  grossAmount: "number",
  fees: "number",
  portfolio: "text",
  currency: "text",
};

const ROW_GRID =
  "grid-cols-[64px_56px_1fr_0.9fr_0.7fr_0.7fr_0.9fr_0.9fr_0.7fr_1fr_0.9fr]";

interface ImportValidationTableProps {
  rows: ImportValidationRow[];
  onUpdateRow: (
    rowIndex: number,
    field: keyof ImportValidationRow["data"],
    value: string | number,
  ) => void;
}

function StatusPill({ status }: { status: ImportValidationRow["status"] }) {
  const label = status === "valid" ? "OK" : status === "error" ? "ERR" : "DUP";
  const tone =
    status === "valid"
      ? "text-pos border-pos"
      : status === "error"
        ? "text-neg border-neg"
        : "text-[var(--warn)] border-[var(--warn)]";
  return (
    <span
      className={cn(
        "inline-block border px-2 py-[1px] font-mono text-[9px] uppercase tracking-[0.18em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function ImportValidationTable({
  rows,
  onUpdateRow,
}: ImportValidationTableProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    field: string;
  } | null>(null);

  const getFieldError = useCallback(
    (row: ImportValidationRow, field: string): string | null => {
      const errors = row.errors ?? [];
      const error = errors.find((e) => e.field === field);
      return error ? error.message : null;
    },
    [],
  );

  const handleStartEdit = useCallback((rowIndex: number, field: string) => {
    setEditingCell({ rowIndex, field });
  }, []);

  const handleSave = useCallback(
    (row: ImportValidationRow, field: FieldKey, value: string | number) => {
      setEditingCell(null);

      const currentValue = row.data[field];
      if (value === currentValue) return;
      if (
        typeof value === "number" &&
        typeof currentValue === "number" &&
        value === currentValue
      )
        return;
      if (String(value) === String(currentValue)) return;

      onUpdateRow(row.rowIndex, field, value);
    },
    [onUpdateRow],
  );

  const handleCancel = useCallback(() => {
    setEditingCell(null);
  }, []);

  const handleTabToNext = useCallback(
    (currentRowIdx: number, currentFieldIdx: number) => {
      const nextFieldIdx = currentFieldIdx + 1;
      if (nextFieldIdx < FIELD_COLUMNS.length) {
        const row = rows.find((r) => r.rowIndex === currentRowIdx);
        if (row) {
          setEditingCell({
            rowIndex: currentRowIdx,
            field: FIELD_COLUMNS[nextFieldIdx],
          });
        }
      } else {
        const currentIdx = rows.findIndex((r) => r.rowIndex === currentRowIdx);
        if (currentIdx >= 0 && currentIdx + 1 < rows.length) {
          setEditingCell({
            rowIndex: rows[currentIdx + 1].rowIndex,
            field: FIELD_COLUMNS[0],
          });
        } else {
          setEditingCell(null);
        }
      }
    },
    [rows],
  );

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1100px]">
        <div
          className={cn(
            "grid gap-2 border-b border-line bg-panel-strong px-3 py-2 font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground",
            ROW_GRID,
          )}
        >
          <div>Status</div>
          <div>Row</div>
          {FIELD_COLUMNS.map((field) => (
            <div key={field} className="text-center">
              {COLUMN_LABELS[field]}
            </div>
          ))}
        </div>

        {rows.map((row) => {
          const isError = row.status === "error";
          const isDup = row.status === "duplicate";
          const rowBg = isError
            ? "bg-[var(--row-error-bg)]"
            : isDup
              ? "bg-[var(--row-duplicate-bg)]"
              : "";

          return (
            <Fragment key={row.rowIndex}>
              <div
                className={cn(
                  "grid items-center gap-2 border-b border-line px-3 py-[7px] font-mono text-[12px] tabular-nums text-foreground",
                  ROW_GRID,
                  rowBg,
                )}
              >
                <div>
                  <StatusPill status={row.status} />
                </div>
                <div className="text-center text-muted-foreground">
                  {row.rowIndex}
                </div>
                {FIELD_COLUMNS.map((field, fieldIdx) => {
                  const fieldError = getFieldError(row, field);
                  const isEditing =
                    editingCell?.rowIndex === row.rowIndex &&
                    editingCell?.field === field;
                  const hasError = Boolean(fieldError) && !isEditing;

                  return (
                    <div
                      key={field}
                      className={cn(
                        "min-w-0 truncate text-center",
                        hasError &&
                          "border border-dashed border-neg px-1 py-[1px] text-neg",
                      )}
                    >
                      <EditableCell
                        rawValue={row.data[field]}
                        displayValue={String(row.data[field] ?? "")}
                        isEditing={isEditing}
                        error={isEditing ? null : fieldError}
                        isHighlighted={false}
                        inputType={INPUT_TYPES[field]}
                        selectOptions={
                          field === "action"
                            ? ACTION_OPTIONS
                            : field === "instrument"
                              ? INSTRUMENT_OPTIONS
                              : undefined
                        }
                        onStartEdit={() =>
                          handleStartEdit(row.rowIndex, field)
                        }
                        onSave={(value) => handleSave(row, field, value)}
                        onCancel={handleCancel}
                        onTabToNext={() =>
                          handleTabToNext(row.rowIndex, fieldIdx)
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {isError && row.errors && row.errors.length > 0 && (
                <div
                  className={cn(
                    "border-b border-dashed border-neg px-3 py-1 pl-20 font-mono text-[10px] uppercase tracking-[0.08em] text-neg",
                    rowBg,
                  )}
                >
                  <span className="font-bold">!</span>{" "}
                  {row.errors.map((e) => `${e.field}: ${e.message}`).join(" · ")}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
