"use client";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { ImportValidationRow } from "@/server/types/import";
import { cn } from "@/lib/utils";
import { FIELD_COLUMNS, COLUMN_LABELS } from "@/shared/schemas/transaction-fields";

function getDuplicateSource(row: ImportValidationRow): string {
  if (!row.duplicateOf) return "";
  if (row.duplicateOf.source === "existing") return "Matches existing transaction";
  return `Matches row ${row.duplicateOf.batchRowIndex} in this file`;
}

interface ImportDuplicateTableProps {
  duplicates: ImportValidationRow[];
  overriddenDuplicates: Set<number>;
  onToggleDuplicate: (rowIndex: number) => void;
}

export function ImportDuplicateTable({
  duplicates,
  overriddenDuplicates,
  onToggleDuplicate,
}: ImportDuplicateTableProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-amber-700">
        {duplicates.length} potential {duplicates.length === 1 ? "duplicate" : "duplicates"}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">Row</TableHead>
            {FIELD_COLUMNS.map((field) => (
              <TableHead key={field}>{COLUMN_LABELS[field]}</TableHead>
            ))}
            <TableHead>Source</TableHead>
            <TableHead className="w-24">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {duplicates.map((row) => {
            const isOverridden = overriddenDuplicates.has(row.rowIndex);
            return (
              <TableRow
                key={row.rowIndex}
                className={cn(
                  "bg-amber-50 hover:bg-amber-50",
                  !isOverridden && "opacity-50",
                )}
              >
                <TableCell className="tabular-nums text-zinc-500">
                  {row.rowIndex}
                </TableCell>
                {FIELD_COLUMNS.map((field) => (
                  <TableCell
                    key={field}
                    className={cn(!isOverridden && "line-through")}
                  >
                    {String(row.data[field] ?? "")}
                  </TableCell>
                ))}
                <TableCell className="text-xs text-amber-600">
                  {getDuplicateSource(row)}
                </TableCell>
                <TableCell>
                  <Button
                    variant={isOverridden ? "default" : "secondary"}
                    size="xs"
                    onClick={() => onToggleDuplicate(row.rowIndex)}
                  >
                    {isOverridden ? "Override" : "Skip"}
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
