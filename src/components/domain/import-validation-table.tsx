"use client";

import { useState, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EditableCell } from "@/components/domain/editable-cell";
import type { ImportValidationRow } from "@/server/types/import";
import { cn } from "@/lib/utils";
import { FIELD_COLUMNS, COLUMN_LABELS, ACTION_OPTIONS, type FieldKey } from "@/shared/schemas/transaction-fields";

const INPUT_TYPES: Record<FieldKey, "text" | "number" | "date" | "select"> = {
  date: "date",
  ticker: "text",
  action: "select",
  quantity: "number",
  grossAmount: "number",
  fees: "number",
  portfolio: "text",
  currency: "text",
};

interface ImportValidationTableProps {
  rows: ImportValidationRow[];
  onUpdateRow: (
    rowIndex: number,
    field: keyof ImportValidationRow["data"],
    value: string | number,
  ) => void;
}

export function ImportValidationTable({
  rows,
  onUpdateRow,
}: ImportValidationTableProps) {
  const [editingCell, setEditingCell] = useState<{
    rowIndex: number;
    field: string;
  } | null>(null);

  const errorCount = rows.filter((r) => r.status === "error").length;

  const getFieldError = useCallback(
    (row: ImportValidationRow, field: string): string | null => {
      const errors = row.errors ?? [];
      const error = errors.find((e) => e.field === field);
      return error ? error.message : null;
    },
    [],
  );

  const hasRowError = useCallback(
    (row: ImportValidationRow): boolean => {
      return row.status === "error";
    },
    [],
  );

  const handleStartEdit = useCallback(
    (rowIndex: number, field: string) => {
      setEditingCell({ rowIndex, field });
    },
    [],
  );

  const handleSave = useCallback(
    (row: ImportValidationRow, field: FieldKey, value: string | number) => {
      setEditingCell(null);

      // Guard against double-fire: skip if value hasn't changed
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
      // Move to next field in same row, or first field of next row
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
        // Move to first field of next row
        const currentIdx = rows.findIndex(
          (r) => r.rowIndex === currentRowIdx,
        );
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
    <div className="space-y-3">
      {errorCount > 0 && (
        <p className="text-sm font-medium text-red-600">
          {errorCount} {errorCount === 1 ? "row needs" : "rows need"} attention
        </p>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Row</TableHead>
            {FIELD_COLUMNS.map((field) => (
              <TableHead key={field}>{COLUMN_LABELS[field]}</TableHead>
            ))}
            <TableHead className="w-16">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const isError = hasRowError(row);
            return (
              <TableRow
                key={row.rowIndex}
                className={cn(isError && "bg-red-50 hover:bg-red-50")}
              >
                <TableCell className="tabular-nums text-zinc-500">
                  {row.rowIndex}
                </TableCell>
                {FIELD_COLUMNS.map((field, fieldIdx) => {
                  const fieldError = getFieldError(row, field);
                  const isEditing =
                    editingCell?.rowIndex === row.rowIndex &&
                    editingCell?.field === field;

                  return (
                    <TableCell
                      key={field}
                      className={cn(
                        fieldError && !isEditing && "ring-1 ring-red-500 rounded",
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
                          field === "action" ? ACTION_OPTIONS : undefined
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
                    </TableCell>
                  );
                })}
                <TableCell>
                  <span
                    className={cn(
                      "text-xs font-medium",
                      isError
                        ? "text-red-600"
                        : row.status === "duplicate"
                          ? "text-amber-600"
                          : "text-green-600",
                    )}
                  >
                    {row.status}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
