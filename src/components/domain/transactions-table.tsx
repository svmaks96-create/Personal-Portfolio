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
import { updateTransaction } from "@/server/actions/transactions";
import { getTransactionsColumns } from "@/components/domain/transactions-columns";
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
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [cellError, setCellError] = useState<{ rowId: number; field: string; message: string } | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);

  function handleStartEdit(rowId: number, field: string) {
    setEditingCell({ rowId, field });
    setCellError(null);
  }

  async function handleSave(rowId: number, field: string, value: string | number) {
    const result = await updateTransaction(rowId, field as (typeof EDITABLE_FIELD_ORDER)[number], value);
    if (result.success) {
      setEditingCell(null);
      setCellError(null);
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
    setCellError(null);
  }

  function handleTabToNext(rowId: number, field: string) {
    const idx = EDITABLE_FIELD_ORDER.indexOf(field as (typeof EDITABLE_FIELD_ORDER)[number]);
    if (idx < EDITABLE_FIELD_ORDER.length - 1) {
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
