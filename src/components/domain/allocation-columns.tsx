"use client";

import { ColumnDef } from "@tanstack/react-table";
import { EditableCell } from "@/components/domain/editable-cell";
import { Private } from "@/components/domain/private";
import { pnlColorClass } from "@/lib/pnl";
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

function makeRenderEditable(ctx: AllocationEditContext) {
  return function renderEditable(
    row: { original: AllocationTargetRow },
    field: string,
    rawValue: string | number,
    displayValue: string,
    inputType: "text" | "number",
    displayNode?: React.ReactNode,
  ) {
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
}

function nameColumn(
  renderEditable: ReturnType<typeof makeRenderEditable>,
): ColumnDef<AllocationTargetRow> {
  return {
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
  };
}

function targetWeightColumn(
  renderEditable: ReturnType<typeof makeRenderEditable>,
): ColumnDef<AllocationTargetRow> {
  return {
    accessorKey: "targetWeight",
    header: "Target %",
    accessorFn: (row) => row.targetWeight.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) =>
      renderEditable(
        row,
        "targetWeight",
        row.original.targetWeight.value ?? 0,
        row.original.targetWeight.display,
        "number",
      ),
    meta: { align: "center" as const },
  };
}

function targetWeightDashColumn(): ColumnDef<AllocationTargetRow> {
  return {
    id: "targetWeight",
    header: "Target %",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.targetWeight.display}
      </span>
    ),
    enableSorting: false,
    meta: { align: "center" as const },
  };
}

function positionValueColumn(): ColumnDef<AllocationTargetRow> {
  return {
    id: "positionValue",
    header: "Position $",
    accessorFn: (row) => row.positionValue.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <span className="text-foreground">
          {row.original.positionValue.display}
        </span>
      </Private>
    ),
    meta: { align: "center" as const },
  };
}

function realWeightColumn(): ColumnDef<AllocationTargetRow> {
  return {
    id: "realWeight",
    header: "Real %",
    accessorFn: (row) => row.realWeight.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className="text-foreground">{row.original.realWeight.display}</span>
    ),
    meta: { align: "center" as const },
  };
}

function diffColumn(): ColumnDef<AllocationTargetRow> {
  return {
    id: "realWeightDiff",
    header: "Diff",
    accessorFn: (row) => row.realWeightDiff.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={cn("text-foreground", pnlColorClass(row.original.realWeightDiff.value))}>
        {row.original.realWeightDiff.display}
      </span>
    ),
    meta: { align: "center" as const },
  };
}

function deltaSharesColumn(): ColumnDef<AllocationTargetRow> {
  return {
    id: "deltaShares",
    header: "Δ Shares",
    accessorFn: (row) => row.deltaShares.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={cn("text-foreground", pnlColorClass(row.original.deltaShares.value))}>
        {row.original.deltaShares.display}
      </span>
    ),
    meta: { align: "center" as const },
  };
}

function deltaValueColumn(): ColumnDef<AllocationTargetRow> {
  return {
    id: "deltaValue",
    header: "Δ Value",
    accessorFn: (row) => row.deltaValue.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <span className={cn("text-foreground", pnlColorClass(row.original.deltaValue.value))}>
          {row.original.deltaValue.display}
        </span>
      </Private>
    ),
    meta: { align: "center" as const },
  };
}

function deleteColumn(ctx: AllocationEditContext): ColumnDef<AllocationTargetRow> {
  return {
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
  };
}

function cashAmountColumn(
  renderEditable: ReturnType<typeof makeRenderEditable>,
): ColumnDef<AllocationTargetRow> {
  return {
    accessorKey: "cashAmountUsd",
    header: "Cash $",
    accessorFn: (row) => row.cashAmountUsd.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) =>
      renderEditable(
        row,
        "cashAmountUsd",
        row.original.cashAmountUsd.value ?? 0,
        row.original.cashAmountUsd.display,
        "number",
        <Private>{row.original.cashAmountUsd.display}</Private>,
      ),
    meta: { align: "center" as const },
  };
}

export function getTickerAllocationColumns(
  ctx: AllocationEditContext,
): ColumnDef<AllocationTargetRow>[] {
  const renderEditable = makeRenderEditable(ctx);
  return [
    nameColumn(renderEditable),
    targetWeightColumn(renderEditable),
    positionValueColumn(),
    realWeightColumn(),
    diffColumn(),
    deltaSharesColumn(),
    deltaValueColumn(),
    deleteColumn(ctx),
  ];
}

export function getCashAllocationColumns(
  ctx: AllocationEditContext,
): ColumnDef<AllocationTargetRow>[] {
  const renderEditable = makeRenderEditable(ctx);
  return [
    nameColumn(renderEditable),
    targetWeightDashColumn(),
    cashAmountColumn(renderEditable),
    realWeightColumn(),
    diffColumn(),
    deltaSharesColumn(),
    deltaValueColumn(),
    deleteColumn(ctx),
  ];
}
