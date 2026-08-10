interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  strokeWidth?: number;
  className?: string;
  /** Dashed reference line at the first data value, so up/down vs the window start is readable. */
  baseline?: boolean;
  /** Marker on the last data point. */
  endDot?: boolean;
}

export function Sparkline({
  data,
  width = 220,
  height = 50,
  color = "currentColor",
  fill = true,
  strokeWidth = 1.6,
  className,
  baseline = false,
  endDot = false,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        style={{ display: "block" }}
        aria-hidden
      />
    );
  }

  let min = data[0];
  let max = data[0];
  for (const v of data) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;

  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return [x, y] as const;
  });
  const stroke = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${stroke} L${width.toFixed(2)},${height.toFixed(2)} L0,${height.toFixed(2)} Z`;

  return (
    <svg
      width={width}
      height={height}
      className={className}
      style={{ display: "block", overflow: "visible" }}
      aria-hidden
    >
      {fill && <path d={area} fill={color} opacity={0.12} />}
      {baseline && (
        <line
          x1={0}
          x2={width}
          y1={pts[0][1]}
          y2={pts[0][1]}
          stroke="var(--muted-foreground)"
          strokeWidth={1}
          strokeDasharray="2 3"
          opacity={0.45}
        />
      )}
      <path
        d={stroke}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {endDot && (
        <circle
          cx={pts[pts.length - 1][0]}
          cy={pts[pts.length - 1][1]}
          r={3}
          fill={color}
          stroke="var(--background)"
          strokeWidth={1.5}
        />
      )}
    </svg>
  );
}
