import { TerminalPanel } from "@/components/domain/terminal-panel";
import { formatMultiple, formatPercentDetailed } from "@/lib/formatting";

interface PositionValuationPanelProps {
  psTtm: number | null;
  pbTtm: number | null;
  pfcfTtm: number | null;
  evEbitdaTtm: number | null;
  /** Fractions (e.g. 0.27 = 27%). */
  netMarginTtm: number | null;
  roeTtm: number | null;
  debtToEquityTtm: number | null;
}

export function PositionValuationPanel({
  psTtm,
  pbTtm,
  pfcfTtm,
  evEbitdaTtm,
  netMarginTtm,
  roeTtm,
  debtToEquityTtm,
}: PositionValuationPanelProps) {
  const pct = (v: number | null) =>
    v === null ? "N/A" : formatPercentDetailed(v * 100);

  const rows = [
    { key: "P/S", value: formatMultiple(psTtm) },
    { key: "P/B", value: formatMultiple(pbTtm) },
    { key: "P/FCF", value: formatMultiple(pfcfTtm) },
    { key: "EV/EBITDA", value: formatMultiple(evEbitdaTtm) },
    { key: "Net margin", value: pct(netMarginTtm) },
    { key: "ROE", value: pct(roeTtm) },
    { key: "Debt / Equity", value: formatMultiple(debtToEquityTtm) },
  ];

  return (
    <TerminalPanel label="VALUATION & RATIOS" className="flex-1">
      <div className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={
              "flex items-baseline justify-between py-2 font-mono text-[12px]" +
              (i < rows.length - 1 ? " border-b border-line-soft" : "")
            }
          >
            <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              {row.key}
            </span>
            <span
              className={
                row.value === "N/A"
                  ? "text-muted-foreground"
                  : "tabular-nums text-foreground"
              }
            >
              {row.value}
            </span>
          </div>
        ))}
      </div>
    </TerminalPanel>
  );
}
