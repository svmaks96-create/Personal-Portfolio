"use client";

import { useEffect, useRef, useState } from "react";
import { format, parseISO } from "date-fns";

interface PriceHistory {
  dates: string[];
  prices: number[];
}

interface Trade {
  date: string;
  action: "buy" | "sell";
  qty: number;
  price: number;
}

interface PositionPriceChartProps {
  history: PriceHistory;
  trades: Trade[];
  avgEntry: number | null;
  currency: string;
  height?: number;
}

const PAD = { t: 18, r: 24, b: 28, l: 56 };

export function PositionPriceChart({
  history,
  trades,
  avgEntry,
  currency,
  height = 300,
}: PositionPriceChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(360, Math.floor(e.contentRect.width));
        setWidth(w);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { dates, prices } = history;
  const hasData = prices.length >= 2;

  return (
    <div ref={wrapRef} className="w-full" style={{ minHeight: height }}>
      {hasData ? (
        <ChartSvg
          width={width}
          height={height}
          dates={dates}
          prices={prices}
          trades={trades}
          avgEntry={avgEntry}
          currency={currency}
        />
      ) : (
        <div
          className="flex w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          style={{ height }}
        >
          No price history available
        </div>
      )}
    </div>
  );
}

interface ChartSvgProps {
  width: number;
  height: number;
  dates: string[];
  prices: number[];
  trades: Trade[];
  avgEntry: number | null;
  currency: string;
}

function ChartSvg({
  width,
  height,
  dates,
  prices,
  trades,
  avgEntry,
  currency,
}: ChartSvgProps) {
  const plotW = Math.max(1, width - PAD.l - PAD.r);
  const plotH = Math.max(1, height - PAD.t - PAD.b);

  let min = prices[0];
  let max = prices[0];
  for (const v of prices) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  // Stretch the range so trade markers near the extremes don't sit on the axis.
  const yPad = (max - min) * 0.08 || Math.max(1, Math.abs(max) * 0.05);
  const yMin = min - yPad;
  const yMax = max + yPad;
  const yRange = yMax - yMin || 1;

  const n = prices.length;
  const x = (i: number) => PAD.l + (i / (n - 1)) * plotW;
  const y = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;

  // Map ISO date → index for fast trade lookup.
  const dateIdx = new Map<string, number>();
  for (let i = 0; i < dates.length; i++) dateIdx.set(dates[i], i);
  const firstDate = parseISO(dates[0]);

  const tradePoints = trades
    .map((t) => {
      let idx = dateIdx.get(t.date);
      if (idx === undefined) {
        // Fallback: estimate index from day offset (e.g. trade on a non-trading day).
        const dt = parseISO(t.date);
        const offsetDays = Math.round(
          (dt.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        idx = Math.max(0, Math.min(n - 1, offsetDays));
      }
      return { ...t, idx, cx: x(idx), cy: y(t.price) };
    })
    .filter((t) => t.cx >= PAD.l && t.cx <= PAD.l + plotW);

  const yTickCount = 5;
  const yTicks: number[] = [];
  for (let i = 0; i <= yTickCount; i++) {
    yTicks.push(yMin + (yRange * i) / yTickCount);
  }

  const xTickIdx: number[] = [];
  const xStep = Math.max(1, Math.floor(n / 6));
  for (let i = 0; i < n; i += xStep) xTickIdx.push(i);
  const last = xTickIdx[xTickIdx.length - 1];
  if (last !== n - 1) {
    if (n - 1 - last < xStep * 0.6) xTickIdx[xTickIdx.length - 1] = n - 1;
    else xTickIdx.push(n - 1);
  }

  const fmtAxisDate = (iso: string) => format(parseISO(iso), "MMM yy");
  const fmtAxisPrice = (v: number) => {
    if (Math.abs(v) >= 1000) return v.toFixed(0);
    if (Math.abs(v) >= 100) return v.toFixed(0);
    return v.toFixed(1);
  };

  const linePath = prices
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`,
    )
    .join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(2)},${y(yMin).toFixed(2)} L${x(0).toFixed(2)},${y(yMin).toFixed(2)} Z`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: "block", overflow: "visible", maxWidth: "100%" }}
    >
      <defs>
        <linearGradient id="position-price-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--foreground)" stopOpacity="0.10" />
          <stop offset="100%" stopColor="var(--foreground)" stopOpacity="0" />
        </linearGradient>
      </defs>

      {yTicks.map((t, i) => (
        <g key={`yt-${i}`}>
          <line
            x1={PAD.l}
            x2={PAD.l + plotW}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--line-soft)"
            strokeDasharray="2 3"
          />
          <text
            x={PAD.l - 8}
            y={y(t)}
            textAnchor="end"
            dominantBaseline="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
          >
            {fmtAxisPrice(t)}
          </text>
        </g>
      ))}

      {xTickIdx.map((i, j) => (
        <text
          key={`xt-${j}`}
          x={x(i)}
          y={height - 10}
          textAnchor="middle"
          fontSize="10"
          fill="var(--muted-foreground)"
          fontFamily="var(--font-mono)"
        >
          {fmtAxisDate(dates[i])}
        </text>
      ))}

      {avgEntry !== null && avgEntry >= yMin && avgEntry <= yMax && (
        <g>
          <line
            x1={PAD.l}
            x2={PAD.l + plotW}
            y1={y(avgEntry)}
            y2={y(avgEntry)}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            opacity="0.6"
          />
          <text
            x={PAD.l + plotW + 4}
            y={y(avgEntry)}
            dominantBaseline="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
            fontFamily="var(--font-mono)"
          >
            avg {fmtAxisPrice(avgEntry)}
          </text>
        </g>
      )}

      <path d={areaPath} fill="url(#position-price-fill)" />
      <path
        d={linePath}
        fill="none"
        stroke="var(--foreground)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />

      {tradePoints.map((t, i) => {
        const isBuy = t.action === "buy";
        const color = isBuy ? "var(--pos)" : "var(--neg)";
        return (
          <g key={`trade-${i}`}>
            <line
              x1={t.cx}
              x2={t.cx}
              y1={t.cy}
              y2={PAD.t + plotH}
              stroke={color}
              strokeWidth={1}
              opacity={0.25}
              strokeDasharray="2 2"
            />
            <circle
              cx={t.cx}
              cy={t.cy}
              r={5}
              fill="var(--background)"
              stroke={color}
              strokeWidth={1.6}
            />
            <circle cx={t.cx} cy={t.cy} r={2.2} fill={color} />
            <text
              x={t.cx}
              y={t.cy - 10}
              textAnchor="middle"
              fontSize="9"
              fill={color}
              fontFamily="var(--font-mono)"
              fontWeight={600}
            >
              {isBuy ? "B" : "S"} {t.qty}
            </text>
          </g>
        );
      })}

      <text
        x={width - 4}
        y={PAD.t - 6}
        textAnchor="end"
        fontSize="9"
        fill="var(--muted-foreground)"
        fontFamily="var(--font-mono)"
        style={{ letterSpacing: "0.18em", textTransform: "uppercase" }}
      >
        {currency}
      </text>
    </svg>
  );
}
