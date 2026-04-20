"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { TransactionRow } from "@/server/queries/transactions";
import { EditableCell } from "@/components/domain/editable-cell";
import { NumericCell } from "@/components/domain/numeric-cell";
import { ACTION_OPTIONS } from "@/shared/schemas/transaction-fields";
import { cn } from "@/lib/utils";

interface EditContext {
  editingCell: { rowId: number; field: string } | null;
  cellError: { rowId: number; field: string; message: string } | null;
  highlightedCells: Set<string>;
  onStartEdit: (rowId: number, field: string) => void;
  onSave: (rowId: number, field: string, value: string | number) => void;
  onCancel: () => void;
  onTabToNext: (rowId: number, field: string) => void;
  onDeleteClick: (id: number) => void;
  isDeleting: boolean;
}

function editableCellRenderer(
  row: { original: TransactionRow },
  field: string,
  rawValue: string | number,
  displayValue: string,
  inputType: "text" | "number" | "date" | "select",
  ctx: EditContext,
  selectOptions?: readonly string[],
  displayNode?: React.ReactNode,
) {
  const id = row.original.id;
  return (
    <EditableCell
      rawValue={rawValue}
      displayValue={displayValue}
      displayNode={displayNode}
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

const ACTION_LABEL: Record<string, string> = {
  buy: "BUY",
  sell: "SELL",
  dividend: "DIV",
  fee: "FEE",
};

function ActionPill({ action }: { action: string }) {
  const label = ACTION_LABEL[action] ?? action.toUpperCase();
  const tone =
    action === "buy"
      ? "text-pos border-pos"
      : action === "sell"
        ? "text-neg border-neg"
        : "text-muted-foreground border-line";
  return (
    <span
      className={cn(
        "inline-block border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.12em]",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export function getTransactionsColumns(ctx: EditContext): ColumnDef<TransactionRow>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected()}
            indeterminate={
              table.getIsSomePageRowsSelected() &&
              !table.getIsAllPageRowsSelected()
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      meta: { align: "center" as const },
      size: 40,
    },
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
        editableCellRenderer(
          row,
          "ticker",
          row.original.ticker,
          row.original.ticker,
          "text",
          ctx,
          undefined,
          <span className="font-semibold tracking-[0.02em]">{row.original.ticker}</span>,
        ),
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
          ACTION_LABEL[row.original.action] ?? row.original.action.toUpperCase(),
          "select",
          ctx,
          ACTION_OPTIONS,
          <ActionPill action={row.original.action} />,
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
      header: "Gross",
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
      cell: ({ row }) => (
        <span
          className={cn(
            "tabular-nums",
            row.original.action === "dividend" && "text-pos",
          )}
        >
          {row.original.netAmount.display}
        </span>
      ),
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
      header: "CCY",
      cell: ({ row }) =>
        editableCellRenderer(row, "currency", row.original.currency, row.original.currency, "text", ctx),
      meta: { align: "center" as const },
    },
    {
      id: "delete",
      header: () => null,
      cell: ({ row }) => (
        <button
          type="button"
          className="inline-flex h-[22px] w-[22px] items-center justify-center border border-neg text-[14px] leading-none text-neg hover:bg-neg-soft disabled:opacity-35"
          disabled={ctx.isDeleting}
          onClick={(e) => {
            e.stopPropagation();
            ctx.onDeleteClick(row.original.id);
          }}
          aria-label="Delete transaction"
        >
          ×
        </button>
      ),
      enableSorting: false,
      meta: { align: "center" as const },
      size: 40,
    },
  ];
}
