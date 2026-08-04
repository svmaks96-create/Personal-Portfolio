import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { pnlColorClass } from "@/lib/pnl";
import type { ConstructionRollupRow } from "@/server/queries/construction";

interface ConstructionRollupTableProps {
  rollups: ConstructionRollupRow[];
}

const HEAD_CLASSES =
  "h-auto px-3.5 py-2 font-mono text-[9px] font-normal uppercase tracking-[0.22em] text-muted-foreground";
const CELL_CLASSES = "px-3.5 py-[7px] font-mono text-[12px]";

export function ConstructionRollupTable({ rollups }: ConstructionRollupTableProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          Bucket Roll-Up
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          Policy vs Model vs Real
        </span>
      </div>
      <Table className="table-fixed font-mono tabular-nums">
        <TableHeader>
          <TableRow className="border-b border-line bg-panel-strong hover:bg-panel-strong">
            <TableHead className={cn(HEAD_CLASSES, "w-[200px] text-left")}>Bucket</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Policy %</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Model %</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Real %</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Drift Pts</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Drift Rel</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Names</TableHead>
            <TableHead className={cn(HEAD_CLASSES, "text-center")}>Band</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rollups.map((row) => (
            <TableRow
              key={row.bucket}
              className="border-b border-line transition-colors last:border-b-0 hover:bg-panel-strong"
            >
              <TableCell className={cn(CELL_CLASSES, "text-left font-semibold tracking-[0.02em] text-foreground")}>
                {row.label}
              </TableCell>
              <TableCell className={cn(CELL_CLASSES, "text-center text-foreground")}>
                {row.policyTarget.display}
              </TableCell>
              <TableCell
                className={cn(
                  CELL_CLASSES,
                  "text-center",
                  row.modelTarget.value !== row.policyTarget.value
                    ? "text-[var(--warn)]"
                    : "text-foreground",
                )}
              >
                {row.modelTarget.display}
              </TableCell>
              <TableCell className={cn(CELL_CLASSES, "text-center text-foreground")}>
                {row.realWeight.display}
              </TableCell>
              <TableCell
                className={cn(CELL_CLASSES, "text-center", pnlColorClass(row.drift.value))}
              >
                {row.drift.display}
              </TableCell>
              <TableCell
                className={cn(CELL_CLASSES, "text-center", pnlColorClass(row.driftRel.value))}
              >
                {row.driftRel.display}
              </TableCell>
              <TableCell className={cn(CELL_CLASSES, "text-center text-foreground")}>
                {row.bucket === "cash" ? "—" : row.nameCount}
              </TableCell>
              <TableCell className={cn(CELL_CLASSES, "text-center")}>
                {row.bandBreach ? (
                  <span className="text-neg">BREACH</span>
                ) : (
                  <span className="text-muted-foreground">OK</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
