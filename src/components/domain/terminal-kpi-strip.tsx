import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type KpiTone = "pos" | "neg" | "muted" | "warn" | null;

export interface TerminalKpiCell {
  label: string;
  value: string;
  valueTone?: KpiTone;
  sub?: string;
  subTone?: KpiTone;
  extra?: ReactNode;
}

interface TerminalKpiStripProps {
  cells: TerminalKpiCell[];
  columns?: 3 | 4 | 5;
  className?: string;
}

function toneClass(tone: KpiTone | undefined, kind: "value" | "sub"): string {
  if (tone === "pos") return "text-pos";
  if (tone === "neg") return "text-neg";
  if (tone === "warn") return "text-[var(--warn)]";
  if (tone === "muted") return "text-muted-foreground";
  return kind === "value" ? "text-foreground" : "text-muted-foreground";
}

const COLUMN_CLASS: Record<3 | 4 | 5, string> = {
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

export function TerminalKpiStrip({ cells, columns, className }: TerminalKpiStripProps) {
  const count = (columns ?? cells.length) as 3 | 4 | 5;
  const cols = COLUMN_CLASS[count] ?? "grid-cols-4";

  return (
    <div className={cn("grid border border-line bg-panel", cols, className)}>
      {cells.map((cell, index) => (
        <div
          key={`${cell.label}-${index}`}
          className="flex flex-col gap-1.5 border-r border-line px-4 py-3.5 last:border-r-0"
        >
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            <span className="mr-1 text-muted-foreground">▸</span>
            {cell.label}
          </div>
          <div
            className={cn(
              "font-mono text-[22px] font-medium leading-none tabular-nums tracking-tight",
              toneClass(cell.valueTone, "value"),
            )}
          >
            {cell.value}
          </div>
          {cell.sub ? (
            <div
              className={cn(
                "font-mono text-[10px] tracking-[0.05em]",
                toneClass(cell.subTone, "sub"),
              )}
            >
              {cell.sub}
            </div>
          ) : null}
          {cell.extra}
        </div>
      ))}
    </div>
  );
}
