"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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

const SERIES = [
  { key: "portfolio" as const, label: "Portfolio", color: "var(--chart-portfolio)" },
  { key: "spy" as const, label: "S&P 500 (SPY)", color: "var(--chart-spy)" },
  { key: "qqq" as const, label: "Nasdaq-100 (QQQ)", color: "var(--chart-qqq)" },
];

function formatXAxis(value: string): string {
  return format(parseISO(value), "MMM yyyy");
}

function formatYAxis(value: number): string {
  return `${value.toFixed(2)}x`;
}

function formatTooltipValue(value: number | null): string {
  if (value === null) return "N/A";
  const pct = (value - 1) * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${value.toFixed(3)}x  (${sign}${pct.toFixed(1)}%)`;
}

interface TooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number | null; color: string }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium text-popover-foreground">
        {format(parseISO(label), "MMM d, yyyy")}
      </p>
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-2 tabular-nums">
          <span
            className="inline-block h-2 w-2 rounded-sm"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="text-popover-foreground">
            {formatTooltipValue(entry.value)}
          </span>
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart({ data }: PerformanceChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
        No performance data available.
      </div>
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer
        width="100%"
        height="100%"
        initialDimension={{ width: 600, height: 320 }}
      >
        <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="var(--border)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatXAxis}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            minTickGap={48}
          />
          <YAxis
            tickFormatter={formatYAxis}
            stroke="var(--muted-foreground)"
            tick={{ fontSize: 11 }}
            domain={["auto", "auto"]}
            width={56}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
          />
          {SERIES.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
