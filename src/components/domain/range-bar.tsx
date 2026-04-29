interface RangeBarProps {
  low: number | null;
  high: number | null;
  current: number | null;
  label?: string;
  formatValue?: (v: number) => string;
}

const defaultFormat = (v: number) =>
  v.toLocaleString("en-US", { maximumFractionDigits: 2 });

export function RangeBar({
  low,
  high,
  current,
  label = "now",
  formatValue = defaultFormat,
}: RangeBarProps) {
  const hasRange = low !== null && high !== null && high > low;
  const pct =
    hasRange && current !== null
      ? Math.max(0, Math.min(1, (current - low) / (high - low)))
      : null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between font-mono text-[10px] text-muted-foreground">
        <span>{low !== null ? formatValue(low) : "N/A"}</span>
        <span className="uppercase tracking-[0.18em]">{label}</span>
        <span>{high !== null ? formatValue(high) : "N/A"}</span>
      </div>
      <div className="relative h-1.5 bg-line-soft">
        {pct !== null && (
          <div
            className="absolute -top-[3px] h-3 w-[2px] bg-foreground"
            style={{ left: `calc(${(pct * 100).toFixed(2)}% - 1px)` }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
