import type { ReactNode } from "react";
import { format } from "date-fns";

interface TerminalHeadingProps {
  section?: string;
  portfolio?: string;
  asOf?: Date;
  showDate?: boolean;
  segments?: string[];
  right?: ReactNode;
}

export function TerminalHeading({
  section = "PORTFOLIO",
  portfolio,
  asOf = new Date(),
  showDate = true,
  segments,
  right,
}: TerminalHeadingProps) {
  const finalSegments = segments
    ? segments.map((s) => s.toUpperCase())
    : [
        section.toUpperCase(),
        (portfolio ?? "All portfolios").toUpperCase(),
        ...(showDate ? [format(asOf, "yyyy-MM-dd")] : []),
      ];

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line border-t-2 border-t-foreground py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground">
      <span>{finalSegments.join(" / ")}</span>
      {right ? (
        <span className="text-[10px] font-normal tracking-[0.18em] text-muted-foreground">
          {right}
        </span>
      ) : null}
    </div>
  );
}
