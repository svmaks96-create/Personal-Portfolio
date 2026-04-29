"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
    <div className="border border-line bg-panel">
      <Table className="table-fixed font-mono tabular-nums">
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow
              key={headerGroup.id}
              className="border-b border-line bg-panel-strong hover:bg-panel-strong"
            >
              {headerGroup.headers.map((header) => {
                const align =
                  (header.column.columnDef.meta as { align?: string })?.align;
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-auto cursor-pointer select-none px-3.5 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground",
                      align === "left" ? "text-left" : "text-center",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span
                      className={cn(
                        "inline-flex items-center gap-1",
                        align === "left" ? "" : "justify-center",
                      )}
                    >
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {sorted === "asc" && (
                        <ChevronUp className="h-3 w-3" />
                      )}
                      {sorted === "desc" && (
                        <ChevronDown className="h-3 w-3" />
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
                  "border-b border-line transition-colors",
                  hasInvalidState
                    ? "bg-[var(--row-error-bg)] hover:bg-[var(--row-error-bg)]"
                    : "hover:bg-panel-strong",
                  onRowClick && "cursor-pointer",
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const align =
                    (cell.column.columnDef.meta as { align?: string })?.align;
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3.5 py-[7px] font-mono text-[12px] text-foreground",
                        align === "left" ? "text-left" : "text-center",
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
        {totalsRow && (
          <TableFooter className="border-t-0 bg-panel-strong font-semibold [&>tr]:border-t [&>tr]:border-t-foreground">
            {totalsRow}
          </TableFooter>
        )}
      </Table>
    </div>
  );
}

interface DrillDownPositionsTableProps<TData extends { ticker: string }> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  defaultSort: SortingState;
  emptyMessage?: string;
  totalsRow?: React.ReactNode;
}

export function DrillDownPositionsTable<TData extends { ticker: string }>({
  data,
  columns,
  defaultSort,
  emptyMessage,
  totalsRow,
}: DrillDownPositionsTableProps<TData>) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <PositionsTable
      data={data}
      columns={columns}
      defaultSort={defaultSort}
      emptyMessage={emptyMessage}
      totalsRow={totalsRow}
      onRowClick={(row) => {
        const portfolio = searchParams.get("portfolio");
        const qs = portfolio
          ? `?portfolio=${encodeURIComponent(portfolio)}`
          : "";
        router.push(`/positions/${encodeURIComponent(row.ticker)}${qs}`);
      }}
    />
  );
}
