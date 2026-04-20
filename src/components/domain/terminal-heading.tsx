import { format } from "date-fns";

interface TerminalHeadingProps {
  portfolio?: string;
  asOf?: Date;
}

export function TerminalHeading({ portfolio, asOf = new Date() }: TerminalHeadingProps) {
  const portfolioLabel = (portfolio ?? "All portfolios").toUpperCase();
  const dateLabel = format(asOf, "yyyy-MM-dd");

  return (
    <div className="border-b border-line border-t-2 border-t-foreground py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.3em] text-foreground">
      PORTFOLIO / {portfolioLabel} / {dateLabel}
    </div>
  );
}
