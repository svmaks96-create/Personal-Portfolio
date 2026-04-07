"use client";

import { ColumnDef } from "@tanstack/react-table";
import { TriangleAlert } from "lucide-react";
import type { ActivePositionRow } from "@/server/queries/positions";

function NumericCell({ display }: { display: string }) {
  return <span className="tabular-nums">{display}</span>;
}

export const activePositionsColumns: ColumnDef<ActivePositionRow>[] = [
  {
    accessorKey: "ticker",
    header: "Ticker",
    cell: ({ row }) => (
      <span className="font-medium">
        {row.original.hasInvalidState && (
          <TriangleAlert className="inline mr-1 h-4 w-4 text-amber-600" />
        )}
        {row.original.ticker}
      </span>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "portfolio",
    header: "Portfolio",
    cell: ({ row }) => row.original.portfolio,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "shares",
    header: "Shares",
    accessorFn: (row) => row.shares.value,
    cell: ({ row }) => <NumericCell display={row.original.shares.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "avgEntry",
    header: "Avg Entry",
    accessorFn: (row) => row.avgEntry.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.avgEntry.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "lastPrice",
    header: "Last Price",
    accessorFn: (row) => row.lastPrice.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.lastPrice.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "costBasis",
    header: "Cost Basis",
    accessorFn: (row) => row.costBasis.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.costBasis.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "marketValue",
    header: "Market Value",
    accessorFn: (row) => row.marketValue.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.marketValue.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "dividends",
    header: "Dividends",
    accessorFn: (row) => row.dividends.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.dividends.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "sellProceeds",
    header: "Sell Proceeds",
    accessorFn: (row) => row.sellProceeds.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.sellProceeds.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "pnl",
    header: "P&L",
    accessorFn: (row) => row.pnl.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => {
      const value = row.original.pnl.value;
      const colorClass =
        value === null || value === 0
          ? ""
          : value > 0
            ? "text-emerald-600"
            : "text-red-600";
      return (
        <span className={`tabular-nums ${colorClass}`}>
          {row.original.pnl.display}
        </span>
      );
    },
    meta: { align: "center" as const },
  },
  {
    accessorKey: "weight",
    header: "Weight%",
    accessorFn: (row) => row.weight.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.weight.display} />,
    meta: { align: "center" as const },
  },
];
