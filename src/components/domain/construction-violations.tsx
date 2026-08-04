import Link from "next/link";
import { cn } from "@/lib/utils";
import type { GuidelineViolation } from "@/server/services/guidelines";

interface ConstructionViolationsProps {
  violations: GuidelineViolation[];
  warnCount: number;
  infoCount: number;
}

export function ConstructionViolations({
  violations,
  warnCount,
  infoCount,
}: ConstructionViolationsProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          Violations
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {warnCount} warn · {infoCount} info
        </span>
      </div>
      {violations.length === 0 ? (
        <div className="px-3.5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          No violations — portfolio is inside all policy bands
        </div>
      ) : (
        <ul>
          {violations.map((v, i) => (
            <li
              key={`${v.code}-${v.ticker ?? v.bucket ?? i}`}
              className="flex items-start gap-3 border-b border-line px-3.5 py-2 last:border-b-0"
            >
              <span
                className={cn(
                  "mt-[1px] inline-block w-[52px] shrink-0 text-center font-mono text-[9px] uppercase tracking-[0.18em]",
                  v.severity === "warn"
                    ? "border border-neg text-neg"
                    : "border border-line text-muted-foreground",
                )}
              >
                {v.severity}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {v.code}
              </span>
              <span className="font-mono text-[12px] text-foreground">
                {v.ticker ? (
                  <>
                    <Link
                      href={`/positions/${v.ticker}`}
                      className="underline decoration-line underline-offset-2 hover:decoration-foreground"
                    >
                      {v.ticker}
                    </Link>
                    {" — "}
                  </>
                ) : null}
                {v.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
