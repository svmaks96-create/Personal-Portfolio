"use client";

import { ColumnDef } from "@tanstack/react-table";
import type { TransactionRow } from "@/server/queries/transactions";
import { EditableCell } from "@/components/domain/editable-cell";

function NumericCell({ display }: { display: string }) {
  return <span className="tabular-nums">{display}</span>;
}

const ACTION_OPTIONS = ["buy", "sell", "dividend", "fee"];

interface EditContext {
  editingCell: { rowId: number; field: string } | null;
  cellError: { rowId: number; field: string; message: string } | null;
  highlightedCells: Set<string>;
  onStartEdit: (rowId: number, field: string) => void;
  onSave: (rowId: number, field: string, value: string | number) => void;
  onCancel: () => void;
  onTabToNext: (rowId: number, field: string) => void;
}

function editableCellRenderer(
  row: { original: TransactionRow },
  field: string,
  rawValue: string | number,
  displayValue: string,
  inputType: "text" | "number" | "date" | "select",
  ctx: EditContext,
  selectOptions?: string[],
) {
  const id = row.original.id;
  return (
    <EditableCell
      rawValue={rawValue}
      displayValue={displayValue}
      isEditing={ctx.editingCell?.rowId === id && ctx.editingCell?.field === field}
      error={
        ctx.cellError?.rowId === id && ctx.cellError?.field === field
          ? ctx.cellError.message
          : null
      }
      isHighlighted={ctx.highlightedCells.has(`${id}-${field}`)}
      inputType={inputType}
      selectOptions={selectOptions}
      onStartEdit={() => ctx.onStartEdit(id, field)}
      onSave={(v) => ctx.onSave(id, field, v)}
      onCancel={ctx.onCancel}
      onTabToNext={() => ctx.onTabToNext(id, field)}
    />
  );
}

export function getTransactionsColumns(ctx: EditContext): ColumnDef<TransactionRow>[] {
  return [
    {
      accessorKey: "date",
      header: "Date",
      accessorFn: (row) => row.date.value,
      cell: ({ row }) =>
        editableCellRenderer(row, "date", row.original.date.value, row.original.date.display, "date", ctx),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "ticker",
      header: "Ticker",
      cell: ({ row }) =>
        editableCellRenderer(row, "ticker", row.original.ticker, row.original.ticker, "text", ctx),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "action",
      header: "Action",
      cell: ({ row }) =>
        editableCellRenderer(
          row,
          "action",
          row.original.action,
          row.original.action.charAt(0).toUpperCase() + row.original.action.slice(1),
          "select",
          ctx,
          ACTION_OPTIONS,
        ),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "quantity",
      header: "Quantity",
      accessorFn: (row) => row.quantity.value ?? undefined,
      sortUndefined: "last",
      cell: ({ row }) =>
        editableCellRenderer(
          row,
          "quantity",
          row.original.quantity.value ?? 0,
          row.original.quantity.display,
          "number",
          ctx,
        ),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "grossAmount",
      header: "Gross Amount",
      accessorFn: (row) => row.grossAmount.value ?? undefined,
      sortUndefined: "last",
      cell: ({ row }) =>
        editableCellRenderer(
          row,
          "grossAmount",
          row.original.grossAmount.value ?? 0,
          row.original.grossAmount.display,
          "number",
          ctx,
        ),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "fees",
      header: "Fees",
      accessorFn: (row) => row.fees.value ?? undefined,
      sortUndefined: "last",
      cell: ({ row }) =>
        editableCellRenderer(
          row,
          "fees",
          row.original.fees.value ?? 0,
          row.original.fees.display,
          "number",
          ctx,
        ),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "netAmount",
      header: "Net Amount",
      accessorFn: (row) => row.netAmount.value,
      cell: ({ row }) => <NumericCell display={row.original.netAmount.display} />,
      meta: { align: "center" as const },
    },
    {
      accessorKey: "netAvgPrice",
      header: "Net Avg Price",
      accessorFn: (row) => row.netAvgPrice.value ?? undefined,
      sortUndefined: "last",
      cell: ({ row }) => <NumericCell display={row.original.netAvgPrice.display} />,
      meta: { align: "center" as const },
    },
    {
      accessorKey: "portfolio",
      header: "Portfolio",
      cell: ({ row }) =>
        editableCellRenderer(row, "portfolio", row.original.portfolio, row.original.portfolio, "text", ctx),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "currency",
      header: "Currency",
      cell: ({ row }) =>
        editableCellRenderer(row, "currency", row.original.currency, row.original.currency, "text", ctx),
      meta: { align: "center" as const },
    },
  ];
}
