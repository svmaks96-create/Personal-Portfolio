"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type ColumnDef,
} from "@tanstack/react-table";
import { ChevronUp, ChevronDown } from "lucide-react";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableFooter,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/domain/empty-state";

interface PositionsTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  defaultSort: SortingState;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
  totalsRow?: React.ReactNode;
}

export function PositionsTable<TData>({
  data,
  columns,
  defaultSort,
  emptyMessage,
  onRowClick,
  totalsRow,
}: PositionsTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>(defaultSort);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (data.length === 0) {
    if (emptyMessage) {
      return <EmptyState message={emptyMessage} />;
    }
    return null;
  }

  return (
    <div className="bg-card rounded-lg shadow-sm border border-border">
      <Table className="table-fixed">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="bg-muted border-b border-border hover:bg-muted"
            >
              {headerGroup.headers.map((header) => {
                const align =
                  (header.column.columnDef.meta as { align?: string })?.align;
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={`text-[13px] font-medium text-muted-foreground cursor-pointer select-none ${
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
          {table.getRowModel().rows.map((row) => {
            const hasInvalidState =
              "hasInvalidState" in (row.original as object) &&
              Boolean((row.original as Record<string, unknown>).hasInvalidState);
            return (
              <TableRow
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn(
                  "h-10 border-b border-border",
                  hasInvalidState
                    ? "bg-amber-50 dark:bg-amber-950 hover:bg-amber-100 dark:hover:bg-amber-900"
                    : onRowClick && "hover:bg-muted",
                  onRowClick && "cursor-pointer"
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const align =
                    (cell.column.columnDef.meta as { align?: string })?.align;
                  return (
                    <TableCell
                      key={cell.id}
                      className={`text-[14px] text-foreground ${
                        align === "center" ? "text-center" : ""
                      }`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
        {totalsRow && <TableFooter>{totalsRow}</TableFooter>}
      </Table>
    </div>
  );
}

interface DrillDownPositionsTableProps<TData extends { ticker: string; portfolio: string }> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  defaultSort: SortingState;
  emptyMessage?: string;
  totalsRow?: React.ReactNode;
}

export function DrillDownPositionsTable<TData extends { ticker: string; portfolio: string }>({
  data,
  columns,
  defaultSort,
  emptyMessage,
  totalsRow,
}: DrillDownPositionsTableProps<TData>) {
  const router = useRouter();

  return (
    <PositionsTable
      data={data}
      columns={columns}
      defaultSort={defaultSort}
      emptyMessage={emptyMessage}
      totalsRow={totalsRow}
      onRowClick={(row) => {
        const params = new URLSearchParams({ ticker: row.ticker });
        if (row.portfolio !== "All") {
          params.set("portfolio", row.portfolio);
        }
        router.push(`/transactions?${params.toString()}`);
      }}
    />
  );
}
