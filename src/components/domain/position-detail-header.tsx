import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatting";

interface PositionDetailHeaderProps {
  ticker: string;
  companyName: string | null;
  isActive: boolean;
  isEtf: boolean;
  exchange?: string | null;
  sector?: string | null;
  heldSince: string | null;
}

interface MetaItem {
  label: string;
  value: string;
}

export function PositionDetailHeader({
  ticker,
  companyName,
  isActive,
  isEtf,
  exchange = null,
  sector = null,
  heldSince,
}: PositionDetailHeaderProps) {
  const tagClass = isActive
    ? "border-pos text-pos"
    : "border-neg text-neg";
  const tagLabel = isActive ? "ACTIVE" : "CLOSED";

  const meta: MetaItem[] = [
    { label: "Exchange", value: exchange ?? "N/A" },
    { label: "Sector", value: sector ?? "N/A" },
    { label: "Held since", value: heldSince ? formatDate(heldSince) : "N/A" },
  ];

  return (
    <div className="grid grid-cols-1 items-end gap-y-3 border-b border-line border-t-2 border-t-foreground py-3.5 sm:grid-cols-[1fr_auto]">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-2">
        <span className="font-mono text-[32px] font-semibold leading-none tracking-tight text-foreground">
          {ticker}
        </span>
        {companyName && (
          <span className="font-mono text-[14px] text-muted-foreground">
            {companyName}
          </span>
        )}
        <span
          className={cn(
            "border px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.22em]",
            tagClass,
          )}
        >
          {tagLabel}
        </span>
        {isEtf && (
          <span className="border border-line px-2 py-[3px] font-mono text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            ETF
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-5 sm:justify-end">
        {meta.map((m) => (
          <div
            key={m.label}
            className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
          >
            {m.label}
            <div className="mt-1 text-[12px] tracking-[0.05em] text-foreground normal-case">
              {m.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
