"use client";

import { useState } from "react";
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
import { EmptyState } from "@/components/domain/empty-state";
import { activePositionsColumns } from "@/components/domain/positions-columns";
import type { ActivePositionRow } from "@/server/queries/positions";

interface PositionsTableProps {
  data: ActivePositionRow[];
  emptyMessage: string;
}

export function PositionsTable({ data, emptyMessage }: PositionsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "marketValue", desc: true },
  ]);

  const table = useReactTable({
    data,
    columns: activePositionsColumns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

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
                        header.getContext()
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
              className={`h-10 border-b border-zinc-100 ${
                row.original.hasInvalidState ? "bg-amber-50" : ""
              }`}
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
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
