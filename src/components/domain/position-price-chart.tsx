"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { differenceInDays, format, parseISO } from "date-fns";

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

const PAD = { t: 18, r: 16, b: 28, l: 56 };
/** Trades of the same action within this many px collapse into one marker. */
const CLUSTER_PX = 12;
/** Pointer within this many px of a marker snaps the crosshair to it. */
const SNAP_PX = 10;

const fmtQty = (q: number) =>
  q.toLocaleString("en-US", {
    maximumFractionDigits: Math.abs(q) >= 100 ? 0 : 2,
  });

const fmtPrice = (v: number) =>
  v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtAxisPrice = (v: number) => {
  if (Math.abs(v) >= 100)
    return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return v.toFixed(1);
};

interface TradeCluster {
  action: "buy" | "sell";
  cx: number;
  cy: number;
  trades: (Trade & { idx: number; cx: number })[];
}

interface HoverState {
  /** Crosshair x in svg px (snapped to a cluster when close to one). */
  cx: number;
  /** Price-series index under the crosshair. */
  idx: number;
  cluster: TradeCluster | null;
}

export function PositionPriceChart({
  history,
  trades,
  avgEntry,
  currency,
  height = 300,
}: PositionPriceChartProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(880);
  const [hover, setHover] = useState<HoverState | null>(null);

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
  const n = prices.length;
  const hasData = n >= 2;

  const plotW = Math.max(1, width - PAD.l - PAD.r);
  const plotH = Math.max(1, height - PAD.t - PAD.b);

  const { yMin, yRange } = useMemo(() => {
    if (!hasData) return { yMin: 0, yRange: 1 };
    let min = prices[0];
    let max = prices[0];
    for (const v of prices) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    // Stretch the range so trade markers near the extremes don't sit on the axis.
    const yPad = (max - min) * 0.08 || Math.max(1, Math.abs(max) * 0.05);
    return { yMin: min - yPad, yRange: max - min + 2 * yPad || 1 };
  }, [prices, hasData]);

  const x = (i: number) => PAD.l + (i / (n - 1)) * plotW;
  const y = (v: number) => PAD.t + plotH - ((v - yMin) / yRange) * plotH;
  const xToIdx = (px: number) =>
    Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / plotW) * (n - 1))));

  const clusters = useMemo<TradeCluster[]>(() => {
    if (!hasData) return [];
    const dateIdx = new Map<string, number>();
    for (let i = 0; i < dates.length; i++) dateIdx.set(dates[i], i);
    const firstDate = parseISO(dates[0]);

    const points = trades
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
        return { ...t, idx, cx: x(idx) };
      })
      .filter((t) => t.cx >= PAD.l && t.cx <= PAD.l + plotW)
      .sort((a, b) => a.cx - b.cx);

    const out: TradeCluster[] = [];
    for (const p of points) {
      const last = out[out.length - 1];
      if (
        last &&
        last.action === p.action &&
        p.cx - last.trades[last.trades.length - 1].cx <= CLUSTER_PX
      ) {
        last.trades.push(p);
      } else {
        out.push({ action: p.action, cx: 0, cy: 0, trades: [p] });
      }
    }
    // Place each marker at the cluster's mean x and qty-weighted average price.
    for (const c of out) {
      let sumX = 0;
      let sumQty = 0;
      let sumCost = 0;
      for (const t of c.trades) {
        sumX += t.cx;
        sumQty += t.qty;
        sumCost += t.qty * t.price;
      }
      c.cx = sumX / c.trades.length;
      c.cy = y(sumQty > 0 ? sumCost / sumQty : c.trades[0].price);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trades, dates, hasData, n, plotW, plotH, yMin, yRange]);

  if (!hasData) {
    return (
      <div ref={wrapRef} className="w-full" style={{ minHeight: height }}>
        <div
          className="flex w-full items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground"
          style={{ height }}
        >
          No price history available
        </div>
      </div>
    );
  }

  const handleMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    if (px < PAD.l - 4 || px > PAD.l + plotW + 4) {
      setHover(null);
      return;
    }
    let cluster: TradeCluster | null = null;
    let best = SNAP_PX;
    for (const c of clusters) {
      const d = Math.abs(c.cx - px);
      if (d <= best) {
        best = d;
        cluster = c;
      }
    }
    const cx = cluster ? cluster.cx : x(xToIdx(px));
    setHover({ cx, idx: xToIdx(cx), cluster });
  };

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

  const spanDays = differenceInDays(
    parseISO(dates[n - 1]),
    parseISO(dates[0]),
  );
  const fmtAxisDate = (iso: string) =>
    format(parseISO(iso), spanDays <= 220 ? "MMM d" : "MMM yy");

  const linePath = prices
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`)
    .join(" ");
  const areaPath = `${linePath} L${x(n - 1).toFixed(2)},${y(yMin).toFixed(2)} L${x(0).toFixed(2)},${y(yMin).toFixed(2)} Z`;

  const yMax = yMin + yRange;
  const tooltipOnLeft = hover !== null && hover.cx > PAD.l + plotW * 0.62;

  return (
    <div ref={wrapRef} className="relative w-full" style={{ minHeight: height }}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        style={{ display: "block", overflow: "visible", maxWidth: "100%" }}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
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
              x={PAD.l + plotW - 4}
              y={y(avgEntry) - 5}
              textAnchor="end"
              fontSize="9"
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

        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.cx}
              x2={hover.cx}
              y1={PAD.t}
              y2={PAD.t + plotH}
              stroke="var(--muted-foreground)"
              strokeWidth={1}
              opacity={0.45}
            />
            <circle
              cx={x(hover.idx)}
              cy={y(prices[hover.idx])}
              r={3}
              fill="var(--foreground)"
              stroke="var(--background)"
              strokeWidth={1.5}
            />
          </g>
        )}

        {clusters.map((c, i) => {
          const color = c.action === "buy" ? "var(--pos)" : "var(--neg)";
          const isHovered = hover?.cluster === c;
          const r = (c.trades.length > 1 ? 5.5 : 4.5) + (isHovered ? 1.5 : 0);
          return (
            <g key={`trade-${i}`} pointerEvents="none">
              {isHovered && (
                <line
                  x1={c.cx}
                  x2={c.cx}
                  y1={c.cy}
                  y2={PAD.t + plotH}
                  stroke={color}
                  strokeWidth={1}
                  opacity={0.35}
                  strokeDasharray="2 2"
                />
              )}
              <circle
                cx={c.cx}
                cy={c.cy}
                r={r}
                fill="var(--background)"
                stroke={color}
                strokeWidth={1.6}
              />
              <circle cx={c.cx} cy={c.cy} r={2} fill={color} />
              {c.trades.length > 1 && (
                <text
                  x={c.cx}
                  y={c.cy - r - 3}
                  textAnchor="middle"
                  fontSize="8"
                  fill={color}
                  fontFamily="var(--font-mono)"
                  fontWeight={600}
                >
                  ×{c.trades.length}
                </text>
              )}
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

      {hover && (
        <div
          className="pointer-events-none absolute z-10 border border-line bg-panel px-2.5 py-2 font-mono shadow-sm"
          style={{
            top: PAD.t + 2,
            ...(tooltipOnLeft
              ? { right: width - hover.cx + 10 }
              : { left: hover.cx + 10 }),
          }}
        >
          <div className="text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            {format(parseISO(dates[hover.idx]), "MMM d, yyyy")}
          </div>
          <div className="mt-0.5 text-[12px] font-medium tabular-nums text-foreground">
            {fmtPrice(prices[hover.idx])}
            <span className="ml-1 text-[9px] font-normal uppercase tracking-[0.18em] text-muted-foreground">
              {currency}
            </span>
          </div>
          {hover.cluster && (
            <div className="mt-1.5 space-y-0.5 border-t border-line pt-1.5">
              {hover.cluster.trades.map((t, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1.5 whitespace-nowrap text-[10px] tabular-nums"
                >
                  <span
                    className={`inline-block h-1.5 w-1.5 shrink-0 ${
                      t.action === "buy" ? "bg-pos" : "bg-neg"
                    }`}
                  />
                  <span className="text-muted-foreground">
                    {format(parseISO(t.date), "dd MMM yy")}
                  </span>
                  <span className="text-foreground">
                    {t.action === "buy" ? "B" : "S"} {fmtQty(t.qty)} @{" "}
                    {fmtPrice(t.price)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
