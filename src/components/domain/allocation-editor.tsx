"use client";

import { useState, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type Table as TanstackTable,
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
  updateCashTargetWeight,
  deleteAllocationTarget,
} from "@/server/actions/allocation-targets";
import {
  getTickerAllocationColumns,
  getCashAllocationColumns,
} from "@/components/domain/allocation-columns";
import { EditableCell } from "@/components/domain/editable-cell";
import { formatCurrency, formatPercent } from "@/lib/formatting";
import { pnlColorClass } from "@/lib/pnl";
import { Private } from "@/components/domain/private";
import type {
  AllocationTargetRow,
  CashAggregate,
} from "@/server/queries/allocation-targets";
import type { UpdatableField } from "@/shared/schemas/allocation-target";

const EDITABLE_FIELD_ORDER: UpdatableField[] = [
  "name",
  "bucket",
  "targetWeight",
  "cashAmountUsd",
];

const CASH_AGGREGATE_ROW_ID = -1;
const CASH_AGGREGATE_FIELD = "cashAggregateTarget";

interface AllocationEditorProps {
  rows: AllocationTargetRow[];
  totalTargetWeight: number;
  totalCashUsd: number;
  cashAggregate: CashAggregate;
}

type AddForm =
  | { kind: "ticker"; name: string; targetWeight: string }
  | { kind: "cash"; name: string; cashAmountUsd: string };

const SUM_TOLERANCE = 0.01;

function sumIsOneHundred(total: number): boolean {
  return Math.abs(total - 100) < SUM_TOLERANCE;
}

export function AllocationEditor({
  rows,
  totalTargetWeight,
  totalCashUsd,
  cashAggregate,
}: AllocationEditorProps) {
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [cellError, setCellError] = useState<{ rowId: number; field: string; message: string } | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
  const [tickerSorting, setTickerSorting] = useState<SortingState>([
    { id: "targetWeight", desc: true },
  ]);
  const [cashSorting, setCashSorting] = useState<SortingState>([
    { id: "name", desc: false },
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

  function clearCellState(rowId: number, field: string) {
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
  }

  async function handleSaveCell(rowId: number, field: string, value: string | number) {
    if (rowId === CASH_AGGREGATE_ROW_ID && field === CASH_AGGREGATE_FIELD) {
      const num = typeof value === "number" ? value : Number(value);
      if (!Number.isFinite(num)) {
        setCellError({ rowId, field, message: "Enter a valid number" });
        return;
      }
      const result = await updateCashTargetWeight(num);
      if (result.success) {
        clearCellState(rowId, field);
      } else {
        setCellError({ rowId, field, message: result.error });
      }
      return;
    }

    const result = await updateAllocationTarget(
      rowId,
      field as UpdatableField,
      value,
    );
    if (result.success) {
      clearCellState(rowId, field);
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
      setAddForm({ kind: "cash", name: "", cashAmountUsd: "" });
    }
  }

  async function handleSubmitAdd() {
    if (!addForm || savingRef.current) return;
    savingRef.current = true;
    setIsSaving(true);
    setAddErrors({});

    try {
      if (addForm.kind === "ticker") {
        const weightNum = Number(addForm.targetWeight);
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
          targetWeight: 0,
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

  function updateAddField(key: string, value: string) {
    if (!addForm) return;
    setAddForm({ ...addForm, [key]: value } as AddForm);
    setAddErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  const columnCtx = {
    editingCell,
    cellError,
    highlightedCells,
    onStartEdit: handleStartEdit,
    onSave: handleSaveCell,
    onCancel: handleCancelEdit,
    onTabToNext: handleTabToNext,
    onDeleteClick: handleDeleteClick,
    isDeleting,
  };

  const tickerColumns = useMemo(
    () => getTickerAllocationColumns(columnCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingCell, cellError, highlightedCells, isDeleting],
  );
  const cashColumns = useMemo(
    () => getCashAllocationColumns(columnCtx),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingCell, cellError, highlightedCells, isDeleting],
  );

  const tickerRows = useMemo(
    () => rows.filter((r) => r.kind === "ticker"),
    [rows],
  );
  const cashRows = useMemo(
    () => rows.filter((r) => r.kind === "cash"),
    [rows],
  );

  const tickerTable = useReactTable({
    data: tickerRows,
    columns: tickerColumns,
    state: { sorting: tickerSorting },
    onSortingChange: setTickerSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const cashTable = useReactTable({
    data: cashRows,
    columns: cashColumns,
    state: { sorting: cashSorting },
    onSortingChange: setCashSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const sumOk = sumIsOneHundred(totalTargetWeight);

  const isEditingCashAggregate =
    editingCell?.rowId === CASH_AGGREGATE_ROW_ID &&
    editingCell?.field === CASH_AGGREGATE_FIELD;
  const cashAggregateError =
    cellError?.rowId === CASH_AGGREGATE_ROW_ID &&
    cellError?.field === CASH_AGGREGATE_FIELD
      ? cellError.message
      : null;
  const cashAggregateHighlightKey = `${CASH_AGGREGATE_ROW_ID}-${CASH_AGGREGATE_FIELD}`;
  const cashAggregateHighlighted = highlightedCells.has(cashAggregateHighlightKey);

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
            {cashRows.length} account{cashRows.length === 1 ? "" : "s"}
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

      <AllocationTableSection
        label="Tickers"
        rowCount={tickerRows.length}
        table={tickerTable}
        columnCount={tickerColumns.length}
        emptyMessage="No tickers yet. Click + Ticker to add one."
        showAddForm={addForm?.kind === "ticker"}
        renderAddRow={() =>
          addForm?.kind === "ticker" ? (
            <TickerAddRow
              addForm={addForm}
              addErrors={addErrors}
              isSaving={isSaving}
              updateAddField={updateAddField}
              onSubmit={handleSubmitAdd}
              onCancel={() => {
                setAddForm(null);
                setAddErrors({});
              }}
              columnCount={tickerColumns.length}
            />
          ) : null
        }
      />

      <AllocationTableSection
        label="Cash Accounts"
        rowCount={cashRows.length}
        table={cashTable}
        columnCount={cashColumns.length}
        emptyMessage="No cash accounts yet. Click + Cash Account to add one."
        showAddForm={addForm?.kind === "cash"}
        renderAddRow={() =>
          addForm?.kind === "cash" ? (
            <CashAddRow
              addForm={addForm}
              addErrors={addErrors}
              isSaving={isSaving}
              updateAddField={updateAddField}
              onSubmit={handleSubmitAdd}
              onCancel={() => {
                setAddForm(null);
                setAddErrors({});
              }}
              columnCount={cashColumns.length}
            />
          ) : null
        }
        renderFooterRow={() => (
          <CashTotalsRow
            cashAggregate={cashAggregate}
            isEditing={isEditingCashAggregate}
            error={cashAggregateError}
            isHighlighted={cashAggregateHighlighted}
            onStartEdit={() =>
              handleStartEdit(CASH_AGGREGATE_ROW_ID, CASH_AGGREGATE_FIELD)
            }
            onSave={(v) =>
              handleSaveCell(CASH_AGGREGATE_ROW_ID, CASH_AGGREGATE_FIELD, v)
            }
            onCancel={handleCancelEdit}
          />
        )}
      />

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

interface AllocationTableSectionProps {
  label: string;
  rowCount: number;
  table: TanstackTable<AllocationTargetRow>;
  columnCount: number;
  emptyMessage: string;
  showAddForm: boolean;
  renderAddRow: () => React.ReactNode;
  renderFooterRow?: () => React.ReactNode;
}

function AllocationTableSection({
  label,
  rowCount,
  table,
  columnCount,
  emptyMessage,
  showAddForm,
  renderAddRow,
  renderFooterRow,
}: AllocationTableSectionProps) {
  return (
    <div className="border-b border-line last:border-b-0">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          {label}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {rowCount} row{rowCount === 1 ? "" : "s"}
        </span>
      </div>
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
          {showAddForm && renderAddRow()}
          {rowCount === 0 && !showAddForm && (
            <TableRow>
              <TableCell
                colSpan={columnCount}
                className="py-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground"
              >
                {emptyMessage}
              </TableCell>
            </TableRow>
          )}
          {table.getRowModel().rows.map((row) => (
            <TableRow
              key={row.id}
              className="border-b border-line transition-colors hover:bg-panel-strong last:border-b-0"
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
          {renderFooterRow?.()}
        </TableBody>
      </Table>
    </div>
  );
}

interface CashTotalsRowProps {
  cashAggregate: CashAggregate;
  isEditing: boolean;
  error: string | null;
  isHighlighted: boolean;
  onStartEdit: () => void;
  onSave: (value: string | number) => void;
  onCancel: () => void;
}

function CashTotalsRow({
  cashAggregate,
  isEditing,
  error,
  isHighlighted,
  onStartEdit,
  onSave,
  onCancel,
}: CashTotalsRowProps) {
  return (
    <TableRow className="border-t-2 border-line bg-panel-strong hover:bg-panel-strong">
      <TableCell className="px-3.5 py-[7px] text-left font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-foreground">
        Total Cash
      </TableCell>
      <TableCell className="px-3.5 py-[7px] text-center font-mono text-[12px] text-foreground">
        <EditableCell
          rawValue={cashAggregate.targetWeight.value}
          displayValue={cashAggregate.targetWeight.display}
          isEditing={isEditing}
          error={error}
          isHighlighted={isHighlighted}
          inputType="number"
          onStartEdit={onStartEdit}
          onSave={onSave}
          onCancel={onCancel}
          onTabToNext={onCancel}
        />
      </TableCell>
      <TableCell className="px-3.5 py-[7px] text-center font-mono text-[12px] text-foreground">
        <Private>{cashAggregate.totalCash.display}</Private>
      </TableCell>
      <TableCell className="px-3.5 py-[7px] text-center font-mono text-[12px] text-foreground">
        {cashAggregate.realWeight.display}
      </TableCell>
      <TableCell
        className={cn(
          "px-3.5 py-[7px] text-center font-mono text-[12px]",
          pnlColorClass(cashAggregate.diff.value),
        )}
      >
        {cashAggregate.diff.display}
      </TableCell>
      <TableCell className="px-3.5 py-[7px] text-center font-mono text-[12px] text-muted-foreground">
        —
      </TableCell>
      <TableCell
        className={cn(
          "px-3.5 py-[7px] text-center font-mono text-[12px]",
          pnlColorClass(cashAggregate.deltaValue.value),
        )}
      >
        <Private>{cashAggregate.deltaValue.display}</Private>
      </TableCell>
      <TableCell className="px-3.5 py-[7px]" />
    </TableRow>
  );
}

const inputClasses =
  "w-full h-7 px-1 text-[14px] bg-card rounded ring-1 ring-foreground outline-none";

interface TickerAddRowProps {
  addForm: Extract<AddForm, { kind: "ticker" }>;
  addErrors: Record<string, string>;
  isSaving: boolean;
  updateAddField: (key: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  columnCount: number;
}

function TickerAddRow({
  addForm,
  addErrors,
  isSaving,
  updateAddField,
  onSubmit,
  onCancel,
  columnCount,
}: TickerAddRowProps) {
  return (
    <>
      <TableRow className="h-10 border-b border-line bg-panel-strong">
        <TableCell className="text-left">
          <input
            type="text"
            className={inputClasses}
            value={addForm.name}
            onChange={(e) => updateAddField("name", e.target.value)}
            placeholder="AAPL"
            autoFocus
          />
          {addErrors.name && (
            <span className="block text-red-500 dark:text-red-400 text-xs">
              {addErrors.name}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
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
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
      </TableRow>
      {addErrors._form && (
        <TableRow className="border-b border-line">
          <TableCell colSpan={columnCount} className="py-1 px-4">
            <span className="text-red-500 dark:text-red-400 text-xs">
              {addErrors._form}
            </span>
          </TableCell>
        </TableRow>
      )}
      <TableRow className="border-b border-line">
        <TableCell colSpan={columnCount} className="py-2 px-4">
          <AddFormButtons isSaving={isSaving} onSubmit={onSubmit} onCancel={onCancel} />
        </TableCell>
      </TableRow>
    </>
  );
}

interface CashAddRowProps {
  addForm: Extract<AddForm, { kind: "cash" }>;
  addErrors: Record<string, string>;
  isSaving: boolean;
  updateAddField: (key: string, value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  columnCount: number;
}

function CashAddRow({
  addForm,
  addErrors,
  isSaving,
  updateAddField,
  onSubmit,
  onCancel,
  columnCount,
}: CashAddRowProps) {
  return (
    <>
      <TableRow className="h-10 border-b border-line bg-panel-strong">
        <TableCell className="text-left">
          <input
            type="text"
            className={inputClasses}
            value={addForm.name}
            onChange={(e) => updateAddField("name", e.target.value)}
            placeholder="Schwab Cash"
            autoFocus
          />
          {addErrors.name && (
            <span className="block text-red-500 dark:text-red-400 text-xs">
              {addErrors.name}
            </span>
          )}
        </TableCell>
        <TableCell className="text-center text-muted-foreground">—</TableCell>
        <TableCell className="text-center">
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
        </TableCell>
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
        <TableCell />
      </TableRow>
      {addErrors._form && (
        <TableRow className="border-b border-line">
          <TableCell colSpan={columnCount} className="py-1 px-4">
            <span className="text-red-500 dark:text-red-400 text-xs">
              {addErrors._form}
            </span>
          </TableCell>
        </TableRow>
      )}
      <TableRow className="border-b border-line">
        <TableCell colSpan={columnCount} className="py-2 px-4">
          <AddFormButtons isSaving={isSaving} onSubmit={onSubmit} onCancel={onCancel} />
        </TableCell>
      </TableRow>
    </>
  );
}

function AddFormButtons({
  isSaving,
  onSubmit,
  onCancel,
}: {
  isSaving: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        disabled={isSaving}
        onClick={onSubmit}
        className="border border-foreground bg-foreground px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
      >
        {isSaving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        disabled={isSaving}
        onClick={onCancel}
        className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-35"
      >
        Cancel
      </button>
    </div>
  );
}
