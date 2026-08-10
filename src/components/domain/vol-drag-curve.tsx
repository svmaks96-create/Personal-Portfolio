import {
  dragPctFromVolPct,
  type VolDragPoint,
} from "@/server/services/risk/vol-drag";

interface VolDragCurveProps {
  curve: VolDragPoint[];
  currentVolPct: number | null;
}

const WIDTH = 360;
const HEIGHT = 150;
const PAD_LEFT = 34;
const PAD_RIGHT = 10;
const PAD_TOP = 10;
const PAD_BOTTOM = 22;

/**
 * The drag-vs-volatility curve (σ²/2) with the book's current position
 * marked. Pure server-rendered SVG — the curve is a fixed quadratic; the only
 * data is where on it the portfolio currently sits.
 */
export function VolDragCurve({ curve, currentVolPct }: VolDragCurveProps) {
  if (curve.length === 0) return null;

  const maxVol = curve[curve.length - 1].volPct;
  const maxDrag = curve[curve.length - 1].dragPct;
  const plotWidth = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const x = (volPct: number) => PAD_LEFT + (volPct / maxVol) * plotWidth;
  const y = (dragPct: number) =>
    PAD_TOP + plotHeight - (dragPct / maxDrag) * plotHeight;

  const path = curve
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.volPct).toFixed(1)},${y(p.dragPct).toFixed(1)}`)
    .join(" ");

  const currentDrag =
    currentVolPct === null ? null : dragPctFromVolPct(currentVolPct);
  const volTicks = [0, 10, 20, 30, 40, 50].filter((t) => t <= maxVol);

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      role="img"
      aria-label="Volatility drag curve"
    >
      {/* axes */}
      <line
        x1={PAD_LEFT}
        y1={PAD_TOP + plotHeight}
        x2={PAD_LEFT + plotWidth}
        y2={PAD_TOP + plotHeight}
        stroke="var(--line)"
        strokeWidth="1"
      />
      <line
        x1={PAD_LEFT}
        y1={PAD_TOP}
        x2={PAD_LEFT}
        y2={PAD_TOP + plotHeight}
        stroke="var(--line)"
        strokeWidth="1"
      />
      {volTicks.map((tick) => (
        <g key={tick}>
          <line
            x1={x(tick)}
            y1={PAD_TOP + plotHeight}
            x2={x(tick)}
            y2={PAD_TOP + plotHeight + 3}
            stroke="var(--line)"
            strokeWidth="1"
          />
          <text
            x={x(tick)}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-muted-foreground font-mono text-[8px]"
          >
            {tick}%
          </text>
        </g>
      ))}
      {[Math.round(maxDrag / 2), Math.round(maxDrag)].map((tick) => (
        <text
          key={tick}
          x={PAD_LEFT - 5}
          y={y(tick) + 2.5}
          textAnchor="end"
          className="fill-muted-foreground font-mono text-[8px]"
        >
          {tick}%
        </text>
      ))}

      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />

      {currentVolPct !== null && currentDrag !== null && currentVolPct <= maxVol ? (
        <g>
          <line
            x1={x(currentVolPct)}
            y1={y(currentDrag)}
            x2={x(currentVolPct)}
            y2={PAD_TOP + plotHeight}
            stroke="var(--warn)"
            strokeWidth="1"
            strokeDasharray="3 3"
          />
          <circle
            cx={x(currentVolPct)}
            cy={y(currentDrag)}
            r="3.5"
            fill="var(--warn)"
          />
          <text
            x={Math.min(x(currentVolPct) + 6, WIDTH - 60)}
            y={y(currentDrag) - 6}
            className="fill-foreground font-mono text-[9px]"
          >
            you: {currentVolPct.toFixed(1)}% vol
          </text>
        </g>
      ) : null}
    </svg>
  );
}
