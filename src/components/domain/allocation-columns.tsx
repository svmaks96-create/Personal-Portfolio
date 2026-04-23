"use client";

import { ColumnDef } from "@tanstack/react-table";
import { EditableCell } from "@/components/domain/editable-cell";
import { Private } from "@/components/domain/private";
import { cn } from "@/lib/utils";
import type { AllocationTargetRow } from "@/server/queries/allocation-targets";

interface AllocationEditContext {
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

const DASH = "—";

function KindPill({ kind }: { kind: "ticker" | "cash" }) {
  const label = kind === "ticker" ? "TICKER" : "CASH";
  const tone =
    kind === "ticker"
      ? "text-foreground border-foreground"
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

export function getAllocationColumns(
  ctx: AllocationEditContext,
): ColumnDef<AllocationTargetRow>[] {
  const renderEditable = (
    row: { original: AllocationTargetRow },
    field: string,
    rawValue: string | number,
    displayValue: string,
    inputType: "text" | "number",
    displayNode?: React.ReactNode,
  ) => {
    const id = row.original.id;
    return (
      <EditableCell
        rawValue={rawValue}
        displayValue={displayValue}
        displayNode={displayNode}
        isEditing={
          ctx.editingCell?.rowId === id && ctx.editingCell?.field === field
        }
        error={
          ctx.cellError?.rowId === id && ctx.cellError?.field === field
            ? ctx.cellError.message
            : null
        }
        isHighlighted={ctx.highlightedCells.has(`${id}-${field}`)}
        inputType={inputType}
        onStartEdit={() => ctx.onStartEdit(id, field)}
        onSave={(v) => ctx.onSave(id, field, v)}
        onCancel={ctx.onCancel}
        onTabToNext={() => ctx.onTabToNext(id, field)}
      />
    );
  };

  return [
    {
      accessorKey: "kind",
      header: "Kind",
      cell: ({ row }) => <KindPill kind={row.original.kind} />,
      enableSorting: false,
      meta: { align: "center" as const },
      size: 80,
    },
    {
      accessorKey: "name",
      header: "Name",
      accessorFn: (row) => row.name.value,
      cell: ({ row }) =>
        renderEditable(
          row,
          "name",
          row.original.name.value,
          row.original.name.display,
          "text",
          <span className="font-semibold tracking-[0.02em]">
            {row.original.name.display}
          </span>,
        ),
      meta: { align: "left" as const },
    },
    {
      accessorKey: "targetWeight",
      header: "Target %",
      accessorFn: (row) => row.targetWeight.value,
      cell: ({ row }) =>
        renderEditable(
          row,
          "targetWeight",
          row.original.targetWeight.value,
          row.original.targetWeight.display,
          "number",
        ),
      meta: { align: "center" as const },
    },
    {
      accessorKey: "cashAmountUsd",
      header: "Cash $",
      accessorFn: (row) => row.cashAmountUsd.value ?? undefined,
      sortUndefined: "last",
      cell: ({ row }) => {
        if (row.original.kind === "ticker") {
          return <span className="text-muted-foreground">{DASH}</span>;
        }
        return renderEditable(
          row,
          "cashAmountUsd",
          row.original.cashAmountUsd.value ?? 0,
          row.original.cashAmountUsd.display,
          "number",
          <Private>{row.original.cashAmountUsd.display}</Private>,
        );
      },
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
          aria-label="Delete allocation row"
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
