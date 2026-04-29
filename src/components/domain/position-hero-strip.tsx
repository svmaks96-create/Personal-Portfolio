import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/domain/sparkline";
import { RangeBar } from "@/components/domain/range-bar";
import { formatPercentDetailed } from "@/lib/formatting";
import { pnlColorClass } from "@/lib/pnl";

interface PositionHeroStripProps {
  lastPrice: number | null;
  currency: string;
  dayChange: { abs: number | null; pct: number | null };
  sparkData: number[];
  range52w: { low: number | null; high: number | null };
}

function formatPrice(value: number | null): string {
  if (value === null) return "N/A";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDayAbs(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value === 0) return formatted;
  return value > 0 ? `+${formatted}` : `−${formatted}`;
}

function HeroCellLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      <span className="mr-1">▸</span>
      {children}
    </div>
  );
}

export function PositionHeroStrip({
  lastPrice,
  currency,
  dayChange,
  sparkData,
  range52w,
}: PositionHeroStripProps) {
  const dayTone = pnlColorClass(dayChange.abs);
  const sparkColor =
    dayChange.abs !== null && dayChange.abs < 0 ? "var(--neg)" : "var(--pos)";

  return (
    <div className="grid grid-cols-1 border border-line bg-panel md:grid-cols-[1.1fr_1fr_1.2fr]">
      <div className="flex flex-col gap-2 border-line p-5 md:border-r">
        <HeroCellLabel>Last price</HeroCellLabel>
        <div className="font-mono text-[36px] font-medium leading-none tracking-tight text-foreground">
          {formatPrice(lastPrice)}
          <span className="ml-2 align-baseline font-mono text-[12px] font-normal tracking-[0.18em] text-muted-foreground">
            {currency}
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-3 font-mono text-[12px]">
          <span className={cn("font-medium tabular-nums", dayTone)}>
            {formatDayAbs(dayChange.abs)}
            {dayChange.pct !== null && (
              <span className="ml-1.5">
                ({formatPercentDetailed(dayChange.pct * 100)})
              </span>
            )}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            today
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-line p-5 md:border-r">
        <HeroCellLabel>30-day trend</HeroCellLabel>
        <div className="flex flex-1 items-center">
          {sparkData.length >= 2 ? (
            <Sparkline data={sparkData} width={220} height={50} color={sparkColor} />
          ) : (
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Not enough history
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5">
        <HeroCellLabel>52-week range</HeroCellLabel>
        <div className="mt-1">
          <RangeBar
            low={range52w.low}
            high={range52w.high}
            current={lastPrice}
            label="now"
            formatValue={(v) =>
              v.toLocaleString("en-US", { maximumFractionDigits: 2 })
            }
          />
        </div>
      </div>
    </div>
  );
}
