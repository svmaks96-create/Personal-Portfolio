"use client";

import { useState, useMemo } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateTransaction } from "@/server/actions/transactions";
import { getTransactionsColumns } from "@/components/domain/transactions-columns";
import { AddTransactionRow } from "@/components/domain/add-transaction-row";
import type { TransactionRow } from "@/server/queries/transactions";

const EDITABLE_FIELD_ORDER = [
  "date",
  "ticker",
  "action",
  "quantity",
  "grossAmount",
  "fees",
  "portfolio",
  "currency",
] as const;

interface TransactionsTableProps {
  data: TransactionRow[];
}

export function TransactionsTable({ data }: TransactionsTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [cellError, setCellError] = useState<{ rowId: number; field: string; message: string } | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);

  function handleStartEdit(rowId: number, field: string) {
    setEditingCell({ rowId, field });
    // Only clear error if it belongs to the cell being edited
    setCellError((current) => {
      if (current?.rowId === rowId && current?.field === field) return null;
      return current;
    });
  }

  async function handleSave(rowId: number, field: string, value: string | number) {
    const result = await updateTransaction(rowId, field as (typeof EDITABLE_FIELD_ORDER)[number], value);
    if (result.success) {
      // Only clear editingCell if it hasn't moved (e.g., via Tab) since save started
      setEditingCell((current) => {
        if (current?.rowId === rowId && current?.field === field) return null;
        return current;
      });
      setCellError((current) => {
        if (current?.rowId === rowId && current?.field === field) return null;
        return current;
      });
      const key = `${rowId}-${field}`;
      setHighlightedCells((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setHighlightedCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 700);
    } else {
      setCellError({ rowId, field, message: result.error });
    }
  }

  function handleCancel() {
    setEditingCell(null);
    // Don't clear cellError — it persists until corrected (AC5)
  }

  function handleTabToNext(rowId: number, field: string) {
    const idx = EDITABLE_FIELD_ORDER.indexOf(field as (typeof EDITABLE_FIELD_ORDER)[number]);
    if (idx >= 0 && idx < EDITABLE_FIELD_ORDER.length - 1) {
      setEditingCell({ rowId, field: EDITABLE_FIELD_ORDER[idx + 1] });
    } else {
      setEditingCell(null);
    }
  }

  const columns = useMemo(
    () =>
      getTransactionsColumns({
        editingCell,
        cellError,
        highlightedCells,
        onStartEdit: handleStartEdit,
        onSave: handleSave,
        onCancel: handleCancel,
        onTabToNext: handleTabToNext,
      }),
    [editingCell, cellError, highlightedCells],
  );

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-zinc-200">
      <div className="flex items-center px-4 py-2 border-b border-zinc-100">
        <Button
          variant="secondary"
          size="sm"
          disabled={isAdding}
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add Transaction
        </Button>
      </div>
      <Table className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="bg-zinc-50 border-b border-zinc-200 hover:bg-zinc-50"
            >
              {headerGroup.headers.map((header) => {
                const align =
                  (header.column.columnDef.meta as { align?: string })?.align;
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={`text-[13px] font-medium text-zinc-500 cursor-pointer select-none ${
                      align === "center" ? "text-center" : ""
                    }`}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {sorted === "asc" && (
                        <ChevronUp className="h-3.5 w-3.5" />
                      )}
                      {sorted === "desc" && (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {isAdding && (
            <AddTransactionRow
              onCancel={() => setIsAdding(false)}
              onSuccess={() => setIsAdding(false)}
            />
          )}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="h-10 border-b border-zinc-100"
            >
              {row.getVisibleCells().map((cell) => {
                const align =
                  (cell.column.columnDef.meta as { align?: string })?.align;
                return (
                  <TableCell
                    key={cell.id}
                    className={`text-[14px] text-zinc-900 ${
                      align === "center" ? "text-center" : ""
                    }`}
                  >
                    {flexRender(
                      cell.column.columnDef.cell,
                      cell.getContext(),
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
