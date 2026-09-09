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
import { OptionMarkCell } from "@/components/domain/option-mark-cell";
import { Private } from "@/components/domain/private";
import { TableCell, TableRow } from "@/components/ui/table";
import { pnlColorClass } from "@/lib/pnl";

const DASH = "—";

/** MOIC is centred on 1.0x, not zero: above 1x is a gain, below is a loss. */
function moicColorClass(value: number | null): string {
  return pnlColorClass(value === null ? null : value - 1);
}

function TickerNameCell({
  ticker,
  companyName,
  instrument = "stock",
  hasInvalidState = false,
}: {
  ticker: string;
  companyName: string | null;
  instrument?: "stock" | "option";
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
      {instrument === "option" ? (
        <span className="inline-block shrink-0 border border-foreground px-1.5 py-[1px] font-mono text-[9px] uppercase tracking-[0.12em] text-foreground">
          OPT
        </span>
      ) : null}
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
        instrument={row.original.instrument}
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
    cell: ({ row }) => (
      <Private>
        <NumericCell display={row.original.costBasis.display} />
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "marketValue",
    header: "Mkt Value",
    accessorFn: (row) => row.marketValue.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) =>
      row.original.instrument === "option" ? (
        <OptionMarkCell
          ticker={row.original.ticker}
          marketValue={row.original.marketValue}
          markDate={row.original.markDate}
        />
      ) : (
        <Private>
          <NumericCell display={row.original.marketValue.display} />
        </Private>
      ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "dividends",
    header: "Dividends",
    accessorFn: (row) => row.dividends.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <NumericCell display={row.original.dividends.display} />
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "sellProceeds",
    header: "Sell Proceeds",
    accessorFn: (row) => row.sellProceeds.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <NumericCell display={row.original.sellProceeds.display} />
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "pnl",
    header: "P&L",
    accessorFn: (row) => row.pnl.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <span className={`tabular-nums ${pnlColorClass(row.original.pnl.value)}`}>
          {row.original.pnl.display}
        </span>
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "moic",
    header: "MOIC",
    accessorFn: (row) => row.moic.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={`tabular-nums ${moicColorClass(row.original.moic.value)}`}>
        {row.original.moic.display}
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
        instrument={row.original.instrument}
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
    cell: ({ row }) => (
      <Private>
        <NumericCell display={row.original.totalInvested.display} />
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "totalProceeds",
    header: "Total Proceeds",
    accessorFn: (row) => row.totalProceeds.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <NumericCell display={row.original.totalProceeds.display} />
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "dividends",
    header: "Dividends",
    accessorFn: (row) => row.dividends.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <NumericCell display={row.original.dividends.display} />
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "realizedPnl",
    header: "Realized P&L",
    accessorFn: (row) => row.realizedPnl.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <Private>
        <span className={`tabular-nums ${pnlColorClass(row.original.realizedPnl.value)}`}>
          {row.original.realizedPnl.display}
        </span>
      </Private>
    ),
    meta: { align: "center" as const },
  },
  {
    accessorKey: "moic",
    header: "MOIC",
    accessorFn: (row) => row.moic.value ?? undefined,
    sortUndefined: "last",
    cell: ({ row }) => (
      <span className={`tabular-nums ${moicColorClass(row.original.moic.value)}`}>
        {row.original.moic.display}
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
        <Private>
          <NumericCell display={t.costBasis.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <NumericCell display={t.marketValue.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <NumericCell display={t.dividends.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <NumericCell display={t.sellProceeds.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <span className={`tabular-nums ${pnlColorClass(t.pnl.value)}`}>
            {t.pnl.display}
          </span>
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <span className={`tabular-nums ${moicColorClass(t.moic.value)}`}>
          {t.moic.display}
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
        <Private>
          <NumericCell display={t.totalInvested.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <NumericCell display={t.totalProceeds.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <NumericCell display={t.dividends.display} />
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <Private>
          <span className={`tabular-nums ${pnlColorClass(t.realizedPnl.value)}`}>
            {t.realizedPnl.display}
          </span>
        </Private>
      </TableCell>
      <TableCell className={totalNumCls}>
        <span className={`tabular-nums ${moicColorClass(t.moic.value)}`}>
          {t.moic.display}
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
