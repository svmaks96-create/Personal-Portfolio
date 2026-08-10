"use client";

import { useMemo, useState, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  createColumnHelper,
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
import { cn } from "@/lib/utils";
import { flagForResearch, setWatchlistStatus } from "@/server/actions/screening";
import type { ScreeningResultRow } from "@/server/queries/screening";

const columnHelper = createColumnHelper<ScreeningResultRow>();

/** Sort nulls to the bottom regardless of direction by mapping them low. */
const num = (v: number | null): number => (v === null ? -1e12 : v);

interface ScreeningResultsTableProps {
  results: ScreeningResultRow[];
  runId: number | null;
}

export function ScreeningResultsTable({
  results,
  runId,
}: ScreeningResultsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "composite", desc: true },
  ]);
  const [busyTicker, setBusyTicker] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ ticker: string; message: string } | null>(null);
  const busyRef = useRef(false);

  async function handleFlagToggle(row: ScreeningResultRow) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyTicker(row.ticker);
    setRowError(null);
    try {
      const result =
        row.watchlistStatus === "flagged_for_research"
          ? await setWatchlistStatus(row.ticker, "candidate")
          : await flagForResearch(row.ticker, runId ?? undefined);
      if (!result.success) {
        setRowError({ ticker: row.ticker, message: result.error });
      }
    } finally {
      busyRef.current = false;
      setBusyTicker(null);
    }
  }

  const columns = useMemo(
    () => [
      columnHelper.accessor((r) => r.ticker, {
        id: "ticker",
        header: "Ticker",
        cell: (info) => (
          <span className="font-semibold">{info.getValue()}</span>
        ),
        meta: { align: "left" },
      }),
      columnHelper.accessor((r) => r.companyName ?? "", {
        id: "name",
        header: "Name",
        cell: (info) => (
          <span className="block truncate text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
        meta: { align: "left" },
      }),
      columnHelper.accessor((r) => r.sector ?? "", {
        id: "sector",
        header: "Sector",
        cell: (info) => (
          <span className="block truncate text-[11px] text-muted-foreground">
            {info.getValue() || "—"}
          </span>
        ),
        meta: { align: "left" },
      }),
      columnHelper.accessor((r) => num(r.marketCap.value), {
        id: "mcap",
        header: "Mkt Cap",
        cell: (info) => info.row.original.marketCap.display,
      }),
      columnHelper.accessor((r) => num(r.fwdPe.value), {
        id: "fwdpe",
        header: "Fwd P/E",
        cell: (info) => info.row.original.fwdPe.display,
      }),
      columnHelper.accessor((r) => num(r.epsGrowthFwd.value), {
        id: "growth",
        header: "EPS Fwd",
        cell: (info) => info.row.original.epsGrowthFwd.display,
      }),
      columnHelper.accessor((r) => num(r.priceChange6m.value), {
        id: "mom6",
        header: "6M",
        cell: (info) => info.row.original.priceChange6m.display,
      }),
      columnHelper.accessor((r) => num(r.valueScore.value), {
        id: "value",
        header: "V",
        cell: (info) => info.row.original.valueScore.display,
      }),
      columnHelper.accessor((r) => num(r.growthScore.value), {
        id: "growthScore",
        header: "G",
        cell: (info) => info.row.original.growthScore.display,
      }),
      columnHelper.accessor((r) => num(r.qualityScore.value), {
        id: "quality",
        header: "Q",
        cell: (info) => info.row.original.qualityScore.display,
      }),
      columnHelper.accessor((r) => num(r.momentumScore.value), {
        id: "momentum",
        header: "M",
        cell: (info) => info.row.original.momentumScore.display,
      }),
      columnHelper.accessor((r) => num(r.compositeScore.value), {
        id: "composite",
        header: "Comp",
        cell: (info) => (
          <span className="font-semibold">
            {info.row.original.compositeScore.display}
          </span>
        ),
      }),
      columnHelper.display({
        id: "flag",
        header: "Flag",
        cell: (info) => {
          const row = info.row.original;
          const status = row.watchlistStatus;
          if (status === "researched" || status === "watchlisted") {
            return (
              <span className="border border-line px-1.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                {status}
              </span>
            );
          }
          const flagged = status === "flagged_for_research";
          return (
            <button
              type="button"
              disabled={busyTicker !== null}
              onClick={() => handleFlagToggle(row)}
              className={cn(
                "border px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.14em] disabled:opacity-35",
                flagged
                  ? "border-pos text-pos hover:bg-panel-strong"
                  : "border-line text-muted-foreground hover:text-foreground",
              )}
            >
              {busyTicker === row.ticker
                ? "…"
                : flagged
                  ? "Flagged ✓"
                  : "Flag"}
            </button>
          );
        },
      }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyTicker, runId],
  );

  const table = useReactTable({
    data: results,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (results.length === 0) {
    return (
      <div className="border border-line bg-panel px-3.5 py-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        No screening results yet — set floors above and Run Screen
      </div>
    );
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
                const align = (
                  header.column.columnDef.meta as { align?: string } | undefined
                )?.align;
                const sorted = header.column.getIsSorted();
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-auto cursor-pointer select-none px-2.5 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.18em] text-muted-foreground",
                      align === "left" ? "text-left" : "text-center",
                      header.column.id === "name" && "w-[16%]",
                      header.column.id === "sector" && "w-[11%]",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )}
                      {sorted === "asc" && <ChevronUp className="h-3 w-3" />}
                      {sorted === "desc" && <ChevronDown className="h-3 w-3" />}
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
              className="border-b border-line transition-colors last:border-b-0 hover:bg-panel-strong"
            >
              {row.getVisibleCells().map((cell) => {
                const align = (
                  cell.column.columnDef.meta as { align?: string } | undefined
                )?.align;
                return (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "px-2.5 py-[6px] font-mono text-[11px] text-foreground",
                      align === "left" ? "text-left" : "text-center",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {rowError && (
        <div className="border-t border-neg px-3.5 py-2 font-mono text-[11px] text-neg">
          {rowError.ticker}: {rowError.message}
        </div>
      )}
    </div>
  );
}
