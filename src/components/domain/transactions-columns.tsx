"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { TransactionRow } from "@/server/queries/transactions";

function NumericCell({ display }: { display: string }) {
  return <span className="tabular-nums">{display}</span>;
}

export const transactionsColumns: ColumnDef<TransactionRow>[] = [
  {
    accessorKey: "date",
    header: "Date",
    accessorFn: (row) => row.date.value,
    cell: ({ row }) => row.original.date.display,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "ticker",
    header: "Ticker",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.ticker}</span>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "action",
    header: "Action",
    cell: ({ row }) => (
      <span className="capitalize">{row.original.action}</span>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "quantity",
    header: "Quantity",
    accessorFn: (row) => row.quantity.value,
    cell: ({ row }) => <NumericCell display={row.original.quantity.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "price",
    header: "Price",
    accessorFn: (row) => row.price.value,
    cell: ({ row }) => <NumericCell display={row.original.price.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "fees",
    header: "Fees",
    accessorFn: (row) => row.fees.value,
    cell: ({ row }) => <NumericCell display={row.original.fees.display} />,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "portfolio",
    header: "Portfolio",
    cell: ({ row }) => row.original.portfolio,
    meta: { align: "center" as const },
  },
  {
    accessorKey: "currency",
    header: "Currency",
    cell: ({ row }) => row.original.currency,
    meta: { align: "center" as const },
  },
];
