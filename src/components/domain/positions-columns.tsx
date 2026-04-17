"use client";

import { ColumnDef } from "@tanstack/react-table";
import { TriangleAlert } from "lucide-react";
import type { ActivePositionRow, ClosedPositionRow } from "@/server/queries/positions";
import { NumericCell } from "@/components/domain/numeric-cell";
import { pnlColorClass } from "@/lib/pnl";

export const activePositionsColumns: ColumnDef<ActivePositionRow>[] = [
  {
    accessorKey: "ticker",
    header: "Ticker",
    cell: ({ row }) => (
      <div>
        <span className="font-medium">
          {row.original.hasInvalidState && (
            <TriangleAlert className="inline mr-1 h-4 w-4 text-amber-600 dark:text-amber-400" />
          )}
          {row.original.ticker}
        </span>
        {row.original.companyName && (
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {row.original.companyName}
          </p>
        )}
      </div>
    ),
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
    cell: ({ row }) => (
      <div>
        <span className="tabular-nums">{row.original.lastPrice.display}</span>
        {row.original.priceDate.value !== null && (
          <p
            className={`text-xs ${
              row.original.priceDate.isStale
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground"
            }`}
          >
            {row.original.priceDate.display}
          </p>
        )}
      </div>
    ),
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
    cell: ({ row }) => (
      <span className={`tabular-nums ${pnlColorClass(row.original.pnl.value)}`}>
        {row.original.pnl.display}
      </span>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "irr",
    header: "IRR",
    accessorFn: (row) => row.irr.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={`tabular-nums ${pnlColorClass(row.original.irr.value)}`}>
        {row.original.irr.display}
      </span>
    ),
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

export const closedPositionsColumns: ColumnDef<ClosedPositionRow>[] = [
  {
    accessorKey: "ticker",
    header: "Ticker",
    cell: ({ row }) => (
      <div>
        <span className="font-medium">{row.original.ticker}</span>
        {row.original.companyName && (
          <p className="text-xs text-muted-foreground truncate max-w-[140px]">
            {row.original.companyName}
          </p>
        )}
      </div>
    ),
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
    accessorKey: "avgExit",
    header: "Avg Exit",
    accessorFn: (row) => row.avgExit.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.avgExit.display} />,
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
    accessorKey: "totalInvested",
    header: "Total Invested",
    accessorFn: (row) => row.totalInvested.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.totalInvested.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "totalProceeds",
    header: "Total Proceeds",
    accessorFn: (row) => row.totalProceeds.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.totalProceeds.display} />,
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
    accessorKey: "realizedPnl",
    header: "Realized P&L",
    accessorFn: (row) => row.realizedPnl.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={`tabular-nums ${pnlColorClass(row.original.realizedPnl.value)}`}>
        {row.original.realizedPnl.display}
      </span>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "irr",
    header: "IRR",
    accessorFn: (row) => row.irr.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={`tabular-nums ${pnlColorClass(row.original.irr.value)}`}>
        {row.original.irr.display}
      </span>
    ),
    meta: { align: "center" as const },
  },
];
