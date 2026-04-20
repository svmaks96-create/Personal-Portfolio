"use client";

import { useState, useMemo, useRef } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type SortingState,
  type RowSelectionState,
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
import {
  updateTransaction,
  deleteTransaction,
  bulkDeleteTransactions,
} from "@/server/actions/transactions";
import { getTransactionsColumns } from "@/components/domain/transactions-columns";
import { AddTransactionRow } from "@/components/domain/add-transaction-row";
import { DeleteConfirmationDialog } from "@/components/domain/delete-confirmation-dialog";
import type { TransactionRow } from "@/server/queries/transactions";

const EDITABLE_FIELD_ORDER = [
  "date",
  "ticker",
  "action",
  "quantity",
  "grossAmount",
  "fees",
  "portfolio",
  "currency",
] as const;

type ActionFilter = "ALL" | "BUY" | "SELL" | "DIV" | "FEE";
const ACTION_FILTERS: ActionFilter[] = ["ALL", "BUY", "SELL", "DIV", "FEE"];
const ACTION_FILTER_TO_VALUE: Record<Exclude<ActionFilter, "ALL">, string> = {
  BUY: "buy",
  SELL: "sell",
  DIV: "dividend",
  FEE: "fee",
};

interface TransactionsTableProps {
  data: TransactionRow[];
}

function exportRowsToCsv(rows: TransactionRow[]) {
  const headers = [
    "Date",
    "Ticker",
    "Action",
    "Quantity",
    "Gross Amount",
    "Fees",
    "Net Amount",
    "Net Avg Price",
    "Portfolio",
    "Currency",
  ];
  const body = rows.map((r) => [
    r.date.value,
    r.ticker,
    r.action,
    r.quantity.value ?? "",
    r.grossAmount.value ?? "",
    r.fees.value ?? "",
    r.netAmount.value,
    r.netAvgPrice.value ?? "",
    r.portfolio,
    r.currency,
  ]);
  const escape = (cell: string | number) => {
    const str = String(cell);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const csv = [headers, ...body].map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function TransactionsTable({ data }: TransactionsTableProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingCell, setEditingCell] = useState<{ rowId: number; field: string } | null>(null);
  const [cellError, setCellError] = useState<{ rowId: number; field: string; message: string } | null>(null);
  const [highlightedCells, setHighlightedCells] = useState<Set<string>>(new Set());
  const [sorting, setSorting] = useState<SortingState>([{ id: "date", desc: true }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: number } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [tickerFilter, setTickerFilter] = useState("");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const deletingRef = useRef(false);

  const filteredData = useMemo(() => {
    return data.filter((row) => {
      if (
        actionFilter !== "ALL" &&
        row.action !== ACTION_FILTER_TO_VALUE[actionFilter]
      ) {
        return false;
      }
      if (
        tickerFilter &&
        !row.ticker.toUpperCase().startsWith(tickerFilter.toUpperCase())
      ) {
        return false;
      }
      return true;
    });
  }, [data, tickerFilter, actionFilter]);

  function handleStartEdit(rowId: number, field: string) {
    setEditingCell({ rowId, field });
    setCellError((current) => {
      if (current?.rowId === rowId && current?.field === field) return null;
      return current;
    });
  }

  async function handleSave(rowId: number, field: string, value: string | number) {
    const result = await updateTransaction(rowId, field as (typeof EDITABLE_FIELD_ORDER)[number], value);
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

  function handleCancel() {
    setEditingCell(null);
  }

  function handleTabToNext(rowId: number, field: string) {
    const idx = EDITABLE_FIELD_ORDER.indexOf(field as (typeof EDITABLE_FIELD_ORDER)[number]);
    if (idx >= 0 && idx < EDITABLE_FIELD_ORDER.length - 1) {
      setEditingCell({ rowId, field: EDITABLE_FIELD_ORDER[idx + 1] });
    } else {
      setEditingCell(null);
    }
  }

  function handleDeleteClick(id: number) {
    setEditingCell(null);
    setDeleteError(null);
    setDeleteTarget({ id });
  }

  async function handleConfirmDelete() {
    if (deletingRef.current || !deleteTarget) return;
    deletingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      const result = await deleteTransaction(deleteTarget.id);
      if (result.success) {
        setRowSelection((prev) => {
          const next = { ...prev };
          delete next[String(deleteTarget.id)];
          return next;
        });
        setDeleteTarget(null);
      } else {
        setDeleteError(result.error);
      }
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  async function handleConfirmBulkDelete() {
    if (deletingRef.current) return;
    deletingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);
    setEditingCell(null);

    try {
      const selectedIds = Object.keys(rowSelection).map(Number);
      const result = await bulkDeleteTransactions(selectedIds);
      if (result.success) {
        setRowSelection({});
        setIsBulkDeleting(false);
      } else {
        setDeleteError(result.error);
      }
    } finally {
      deletingRef.current = false;
      setIsDeleting(false);
    }
  }

  const selectedCount = Object.keys(rowSelection).length;

  const columns = useMemo(
    () =>
      getTransactionsColumns({
        editingCell,
        cellError,
        highlightedCells,
        onStartEdit: handleStartEdit,
        onSave: handleSave,
        onCancel: handleCancel,
        onTabToNext: handleTabToNext,
        onDeleteClick: handleDeleteClick,
        isDeleting,
      }),
    [editingCell, cellError, highlightedCells, isDeleting],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getRowId: (row) => String(row.id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="border border-line bg-panel">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-3.5 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Ticker:</span>
          <input
            value={tickerFilter}
            onChange={(e) => setTickerFilter(e.target.value)}
            placeholder="FILTER…"
            className="w-[140px] border border-line bg-panel px-2 py-[5px] font-mono text-[12px] uppercase tracking-[0.05em] text-foreground outline-none focus:border-foreground"
          />
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <span>Action:</span>
          <div className="flex border border-line">
            {ACTION_FILTERS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setActionFilter(a)}
                className={cn(
                  "border-r border-line px-2.5 py-[4px] font-mono text-[10px] uppercase tracking-[0.12em] last:border-r-0",
                  actionFilter === a
                    ? "bg-foreground text-background"
                    : "bg-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1" />
        {selectedCount > 0 && (
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => setIsBulkDeleting(true)}
            className="border border-neg px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-neg hover:bg-neg-soft disabled:opacity-35"
          >
            [ Delete · {selectedCount} ]
          </button>
        )}
        <button
          type="button"
          onClick={() => exportRowsToCsv(filteredData)}
          disabled={filteredData.length === 0}
          className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-foreground hover:bg-panel-strong disabled:opacity-35"
        >
          [ Export CSV ]
        </button>
        <button
          type="button"
          disabled={isAdding}
          onClick={() => {
            setEditingCell(null);
            setIsAdding(true);
          }}
          className="border border-foreground bg-foreground px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
        >
          + Add Row
        </button>
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
                const isSelectCol = header.column.id === "select";
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-auto cursor-pointer select-none px-3.5 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground",
                      align === "center" ? "text-center" : "",
                      isSelectCol && "w-10 px-0",
                    )}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center justify-center gap-1">
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
          {isAdding && (
            <AddTransactionRow
              onCancel={() => setIsAdding(false)}
              onSuccess={() => setIsAdding(false)}
            />
          )}
          {table.getRowModel().rows.map((row) => {
            const isSelected = row.getIsSelected();
            return (
              <TableRow
                key={row.id}
                className={cn(
                  "border-b border-line transition-colors",
                  isSelected
                    ? "bg-panel-strong"
                    : "hover:bg-panel-strong",
                )}
              >
                {row.getVisibleCells().map((cell) => {
                  const align =
                    (cell.column.columnDef.meta as { align?: string })?.align;
                  const isSelectCol = cell.column.id === "select";
                  return (
                    <TableCell
                      key={cell.id}
                      className={cn(
                        "px-3.5 py-[7px] font-mono text-[12px] text-foreground",
                        align === "center" ? "text-center" : "",
                        isSelectCol && "w-10 px-0",
                      )}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Footer hint */}
      <div className="flex items-center justify-between border-t border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        <span>{"// Click any cell to edit inline"}</span>
        <span>
          Showing {filteredData.length} of {data.length}
        </span>
      </div>

      <DeleteConfirmationDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
        count={1}
        onConfirm={handleConfirmDelete}
        isDeleting={isDeleting}
      />

      <DeleteConfirmationDialog
        open={isBulkDeleting}
        onOpenChange={(open) => {
          if (!open) {
            setIsBulkDeleting(false);
            setDeleteError(null);
          }
        }}
        count={selectedCount}
        onConfirm={handleConfirmBulkDelete}
        isDeleting={isDeleting}
      />

      {deleteError && !deleteTarget && !isBulkDeleting && (
        <div className="border-t border-neg bg-[var(--row-error-bg)] px-3.5 py-2 font-mono text-[11px] text-neg">
          {deleteError}
        </div>
      )}
    </div>
  );
}
