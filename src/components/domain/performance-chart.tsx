"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import type { PerformanceChartPoint } from "@/server/queries/performance";

interface PerformanceChartProps {
  data: PerformanceChartPoint[];
}

function formatXAxis(value: string): string {
  return format(parseISO(value), "MMM yyyy");
}

function formatYAxis(value: number): string {
  const pct = (value - 1) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(0)}%`;
}

function formatTooltipValue(value: number | null): string {
  if (value === null) return "N/A";
  const pct = (value - 1) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  return (
    <div className="rounded-sm border border-line bg-panel px-3 py-2 font-mono text-[11px] shadow-md">
      <p className="mb-1 font-semibold uppercase tracking-[0.12em] text-foreground">
        {format(parseISO(label), "MMM d, yyyy")}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 tabular-nums">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="text-foreground">{formatTooltipValue(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-full min-h-[320px] w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        No performance data available.
      </div>
    );
  }

  return (
    <div className="h-full min-h-[320px] w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 320 }}
      >
        <ComposedChart data={data} margin={{ top: 8, right: 20, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="portfolioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-portfolio)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-portfolio)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="2 3"
            stroke="var(--line-soft)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="var(--muted-foreground)"
            tick={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fill: "var(--muted-foreground)",
            }}
            minTickGap={48}
            padding={{ left: 4, right: 16 }}
          />
          <YAxis
            tickFormatter={formatYAxis}
            stroke="var(--muted-foreground)"
            tick={{
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              fill: "var(--muted-foreground)",
            }}
            domain={["auto", "auto"]}
            width={48}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="portfolio"
            name="Portfolio"
            stroke="var(--chart-portfolio)"
            strokeWidth={2}
            fill="url(#portfolioGradient)"
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="spy"
            name="S&P 500 (SPY)"
            stroke="var(--chart-spy)"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="qqq"
            name="Nasdaq-100 (QQQ)"
            stroke="var(--chart-qqq)"
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            activeDot={{ r: 3 }}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
