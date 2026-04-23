"use client";

import { useState, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  createAllocationTarget,
  updateAllocationTarget,
  deleteAllocationTarget,
} from "@/server/actions/allocation-targets";
import { getAllocationColumns } from "@/components/domain/allocation-columns";
import { formatCurrency, formatPercent } from "@/lib/formatting";
import { Private } from "@/components/domain/private";
import type { AllocationTargetRow } from "@/server/queries/allocation-targets";
import type { UpdatableField } from "@/shared/schemas/allocation-target";

const EDITABLE_FIELD_ORDER: UpdatableField[] = [
  "name",
  "targetWeight",
  "cashAmountUsd",
];

interface AllocationEditorProps {
  rows: AllocationTargetRow[];
  totalTargetWeight: number;
  totalCashUsd: number;
}

type AddForm =
  | { kind: "ticker"; name: string; targetWeight: string }
  | { kind: "cash"; name: string; targetWeight: string; cashAmountUsd: string };

const SUM_TOLERANCE = 0.01;

function sumIsOneHundred(total: number): boolean {
  return Math.abs(total - 100) < SUM_TOLERANCE;
}

export function AllocationEditor({
  rows,
  totalTargetWeight,
  totalCashUsd,
}: AllocationEditorProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [cellError, setCellError] = useState<{ rowId: number; field: string; message: string } | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([
    { id: "kind", desc: true },
  ]);
  const [addForm, setAddForm] = useState<AddForm | null>(null);
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const deletingRef = useRef(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleStartEdit(rowId: number, field: string) {
    setEditingCell({ rowId, field });
    setCellError((current) => {
      if (current?.rowId === rowId && current?.field === field) return null;
      return current;
    });
  }

  async function handleSaveCell(rowId: number, field: string, value: string | number) {
    const result = await updateAllocationTarget(
      rowId,
      field as UpdatableField,
      value,
    );
    if (result.success) {
      setEditingCell((current) => {
        if (current?.rowId === rowId && current?.field === field) return null;
        return current;
      });
      setCellError((current) => {
        if (current?.rowId === rowId && current?.field === field) return null;
        return current;
      });
      const key = `${rowId}-${field}`;
      setHighlightedCells((prev) => new Set(prev).add(key));
      setTimeout(() => {
        setHighlightedCells((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }, 700);
    } else {
      setCellError({ rowId, field, message: result.error });
    }
  }

  function handleCancelEdit() {
    setEditingCell(null);
  }

  function handleTabToNext(rowId: number, field: string) {
    const idx = EDITABLE_FIELD_ORDER.indexOf(field as UpdatableField);
    if (idx >= 0 && idx < EDITABLE_FIELD_ORDER.length - 1) {
      setEditingCell({ rowId, field: EDITABLE_FIELD_ORDER[idx + 1] });
    } else {
      setEditingCell(null);
    }
  }

  function handleDeleteClick(id: number) {
    setEditingCell(null);
    setDeleteError(null);
    setDeleteTargetId(id);
  }

  async function handleConfirmDelete() {
    if (deletingRef.current || deleteTargetId === null) return;
    deletingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteAllocationTarget(deleteTargetId);
      if (result.success) {
        setDeleteTargetId(null);
      } else {
        setDeleteError(result.error);
      }
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  const deleteTargetName =
    deleteTargetId !== null
      ? rows.find((r) => r.id === deleteTargetId)?.name.value
      : null;

  function startAdd(kind: "ticker" | "cash") {
    setEditingCell(null);
    setAddErrors({});
    if (kind === "ticker") {
      setAddForm({ kind: "ticker", name: "", targetWeight: "" });
    } else {
      setAddForm({ kind: "cash", name: "", targetWeight: "", cashAmountUsd: "" });
    }
  }

  async function handleSubmitAdd() {
    if (!addForm || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setAddErrors({});

    try {
      const weightNum = Number(addForm.targetWeight);
      if (addForm.kind === "ticker") {
        const result = await createAllocationTarget({
          kind: "ticker",
          name: addForm.name,
          targetWeight: addForm.targetWeight === "" ? -1 : weightNum,
          cashAmountUsd: null,
        });
        if (result.success) {
          setAddForm(null);
        } else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setAddErrors(result.fieldErrors);
        } else {
          setAddErrors({ _form: result.error });
        }
      } else {
        const cashNum = Number(addForm.cashAmountUsd);
        const result = await createAllocationTarget({
          kind: "cash",
          name: addForm.name,
          targetWeight: addForm.targetWeight === "" ? -1 : weightNum,
          cashAmountUsd: addForm.cashAmountUsd === "" ? Number.NaN : cashNum,
        });
        if (result.success) {
          setAddForm(null);
        } else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
          setAddErrors(result.fieldErrors);
        } else {
          setAddErrors({ _form: result.error });
        }
      }
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }

  function updateAddField<K extends keyof (AddForm & { cashAmountUsd?: string })>(
    key: K,
    value: string,
  ) {
    if (!addForm) return;
    setAddForm({ ...addForm, [key]: value } as AddForm);
    setAddErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
  }

  const columns = useMemo(
    () =>
      getAllocationColumns({
        editingCell,
        cellError,
        highlightedCells,
        onStartEdit: handleStartEdit,
        onSave: handleSaveCell,
        onCancel: handleCancelEdit,
        onTabToNext: handleTabToNext,
        onDeleteClick: handleDeleteClick,
        isDeleting,
      }),
    [editingCell, cellError, highlightedCells, isDeleting],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sumOk = sumIsOneHundred(totalTargetWeight);
  const addColumnCount = 5;

  const inputClasses =
    "w-full h-7 px-1 text-[14px] bg-card rounded ring-1 ring-foreground outline-none";

  return (
    <div className="border border-line bg-panel">
      {/* Header strip */}
      <div className="grid grid-cols-2 border-b border-line bg-panel-strong">
        <div className="flex flex-col gap-1.5 border-r border-line px-4 py-3.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="mr-1 text-muted-foreground">▸</span>
            Target total
          </div>
          <div
            className={cn(
              "font-mono text-[22px] font-medium leading-none tabular-nums tracking-tight",
              sumOk ? "text-pos" : "text-[var(--warn)]",
            )}
          >
            {formatPercent(totalTargetWeight)}
          </div>
          <div className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
            {sumOk ? "Balanced" : "Must sum to 100%"}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 px-4 py-3.5">
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="mr-1 text-muted-foreground">▸</span>
            Cash on hand
          </div>
          <div className="font-mono text-[22px] font-medium leading-none tabular-nums tracking-tight text-foreground">
            <Private>{formatCurrency(totalCashUsd)}</Private>
          </div>
          <div className="font-mono text-[10px] tracking-[0.05em] text-muted-foreground">
            {rows.filter((r) => r.kind === "cash").length} account{rows.filter((r) => r.kind === "cash").length === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3.5 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {rows.length} row{rows.length === 1 ? "" : "s"}
        </span>
        <div className="flex-1" />
        <button
          type="button"
          disabled={addForm !== null}
          onClick={() => startAdd("ticker")}
          className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:bg-panel-strong disabled:opacity-35"
        >
          + Ticker
        </button>
        <button
          type="button"
          disabled={addForm !== null}
          onClick={() => startAdd("cash")}
          className="border border-foreground bg-foreground px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
        >
          + Cash Account
        </button>
      </div>

      {/* Table */}
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
          {addForm && (
            <>
              <TableRow className="h-10 border-b border-line bg-panel-strong">
                <TableCell className="text-center">
                  <span
                    className={cn(
                      "inline-block border px-2 py-[1px] font-mono text-[10px] uppercase tracking-[0.12em]",
                      addForm.kind === "ticker"
                        ? "text-foreground border-foreground"
                        : "text-muted-foreground border-line",
                    )}
                  >
                    {addForm.kind === "ticker" ? "TICKER" : "CASH"}
                  </span>
                </TableCell>
                <TableCell className="text-left">
                  <input
                    type="text"
                    className={inputClasses}
                    value={addForm.name}
                    onChange={(e) => updateAddField("name", e.target.value)}
                    placeholder={addForm.kind === "ticker" ? "AAPL" : "Schwab Cash"}
                    autoFocus
                  />
                  {addErrors.name && (
                    <span className="block text-red-500 dark:text-red-400 text-xs">
                      {addErrors.name}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <input
                    type="number"
                    step="0.01"
                    className={cn(inputClasses, "tabular-nums")}
                    value={addForm.targetWeight}
                    onChange={(e) => updateAddField("targetWeight", e.target.value)}
                    placeholder="0"
                  />
                  {addErrors.targetWeight && (
                    <span className="block text-red-500 dark:text-red-400 text-xs">
                      {addErrors.targetWeight}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  {addForm.kind === "cash" ? (
                    <>
                      <input
                        type="number"
                        step="0.01"
                        className={cn(inputClasses, "tabular-nums")}
                        value={addForm.cashAmountUsd}
                        onChange={(e) => updateAddField("cashAmountUsd", e.target.value)}
                        placeholder="0.00"
                      />
                      {addErrors.cashAmountUsd && (
                        <span className="block text-red-500 dark:text-red-400 text-xs">
                          {addErrors.cashAmountUsd}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">{"—"}</span>
                  )}
                </TableCell>
                <TableCell />
              </TableRow>
              {addErrors._form && (
                <TableRow className="border-b border-line">
                  <TableCell colSpan={addColumnCount} className="py-1 px-4">
                    <span className="text-red-500 dark:text-red-400 text-xs">
                      {addErrors._form}
                    </span>
                  </TableCell>
                </TableRow>
              )}
              <TableRow className="border-b border-line">
                <TableCell colSpan={addColumnCount} className="py-2 px-4">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={handleSubmitAdd}
                      className="border border-foreground bg-foreground px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
                    >
                      {isSaving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setAddForm(null);
                        setAddErrors({});
                      }}
                      className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-35"
                    >
                      Cancel
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            </>
          )}
          {rows.length === 0 && !addForm && (
            <TableRow>
              <TableCell
                colSpan={addColumnCount}
                className="py-12 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
              >
                No allocation targets yet. Add a ticker or cash account to begin.
              </TableCell>
            </TableRow>
          )}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="border-b border-line transition-colors hover:bg-panel-strong"
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
          ))}
        </TableBody>
      </Table>

      {/* Footer hint */}
      <div className="flex items-center justify-between border-t border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{"// Click any cell to edit inline"}</span>
        <span>Targets are global across portfolios</span>
      </div>

      <AlertDialog
        open={deleteTargetId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTargetId(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete allocation row</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTargetName
                ? `Remove "${deleteTargetName}" from the allocation model?`
                : "Remove this row from the allocation model?"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={isDeleting}
              onClick={handleConfirmDelete}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {deleteError && deleteTargetId === null && (
        <div className="border-t border-neg bg-[var(--row-error-bg)] px-3.5 py-2 font-mono text-[11px] text-neg">
          {deleteError}
        </div>
      )}
    </div>
  );
}
