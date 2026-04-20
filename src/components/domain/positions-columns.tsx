"use client";

import { ColumnDef } from "@tanstack/react-table";
import { TriangleAlert } from "lucide-react";
import type {
  ActivePositionRow,
  ActivePositionsTotals,
  ClosedPositionRow,
  ClosedPositionsTotals,
} from "@/server/queries/positions";
import { NumericCell } from "@/components/domain/numeric-cell";
import { TableCell, TableRow } from "@/components/ui/table";
import { pnlColorClass } from "@/lib/pnl";

const DASH = "—";

function TickerNameCell({
  ticker,
  companyName,
  hasInvalidState = false,
}: {
  ticker: string;
  companyName: string | null;
  hasInvalidState?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap overflow-hidden">
      {hasInvalidState ? (
        <TriangleAlert className="inline h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : null}
      <span className="font-semibold tracking-[0.02em] text-foreground">
        {ticker}
      </span>
      {companyName ? (
        <span className="truncate text-[11px] text-muted-foreground">
          {companyName}
        </span>
      ) : null}
    </span>
  );
}

export const activePositionsColumns: ColumnDef<ActivePositionRow>[] = [
  {
    accessorKey: "ticker",
    header: "[ Ticker ] / Name",
    cell: ({ row }) => (
      <TickerNameCell
        ticker={row.original.ticker}
        companyName={row.original.companyName}
        hasInvalidState={row.original.hasInvalidState}
      />
    ),
    meta: { align: "left" as const },
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
    header: "Last",
    accessorFn: (row) => row.lastPrice.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className="tabular-nums">
        {row.original.lastPrice.display}
        {row.original.priceDate.value !== null && (
          <span
            className={
              "ml-1.5 text-[10px] " +
              (row.original.priceDate.isStale
                ? "text-amber-600 dark:text-amber-400"
                : "text-muted-foreground")
            }
          >
            {row.original.priceDate.display}
          </span>
        )}
      </span>
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
    header: "Mkt Value",
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
    header: "Weight",
    accessorFn: (row) => row.weight.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => <NumericCell display={row.original.weight.display} />,
    meta: { align: "center" as const },
  },
];

export const closedPositionsColumns: ColumnDef<ClosedPositionRow>[] = [
  {
    accessorKey: "ticker",
    header: "[ Ticker ] / Name",
    cell: ({ row }) => (
      <TickerNameCell
        ticker={row.original.ticker}
        companyName={row.original.companyName}
      />
    ),
    meta: { align: "left" as const },
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
    header: "Last",
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

// --- Totals rows -----------------------------------------------------------

const totalNumCls =
  "px-3.5 py-[7px] font-mono text-[12px] text-foreground text-center";
const totalLabelCls =
  "px-3.5 py-[7px] font-mono text-[9px] uppercase tracking-[0.22em] text-foreground text-left";
const totalDashCls =
  "px-3.5 py-[7px] font-mono text-[12px] text-muted-foreground text-center";

export function ActivePositionsTotalsRow({ totals: t }: { totals: ActivePositionsTotals }) {
  return (
    <TableRow className="bg-panel-strong hover:bg-panel-strong">
      <TableCell className={totalLabelCls}>Total</TableCell>
      <TableCell className={totalDashCls}>{DASH}</TableCell>
      <TableCell className={totalDashCls}>{DASH}</TableCell>
      <TableCell className={totalDashCls}>{DASH}</TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.costBasis.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.marketValue.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.dividends.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.sellProceeds.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <span className={`tabular-nums ${pnlColorClass(t.pnl.value)}`}>
          {t.pnl.display}
        </span>
      </TableCell>
      <TableCell className={totalNumCls}>
        <span className={`tabular-nums ${pnlColorClass(t.irr.value)}`}>
          {t.irr.display}
        </span>
      </TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.weight.display} />
      </TableCell>
    </TableRow>
  );
}

export function ClosedPositionsTotalsRow({ totals: t }: { totals: ClosedPositionsTotals }) {
  return (
    <TableRow className="bg-panel-strong hover:bg-panel-strong">
      <TableCell className={totalLabelCls}>Total</TableCell>
      <TableCell className={totalDashCls}>{DASH}</TableCell>
      <TableCell className={totalDashCls}>{DASH}</TableCell>
      <TableCell className={totalDashCls}>{DASH}</TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.totalInvested.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.totalProceeds.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <NumericCell display={t.dividends.display} />
      </TableCell>
      <TableCell className={totalNumCls}>
        <span className={`tabular-nums ${pnlColorClass(t.realizedPnl.value)}`}>
          {t.realizedPnl.display}
        </span>
      </TableCell>
      <TableCell className={totalNumCls}>
        <span className={`tabular-nums ${pnlColorClass(t.irr.value)}`}>
          {t.irr.display}
        </span>
      </TableCell>
    </TableRow>
  );
}
