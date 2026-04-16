/** Returns Tailwind color class for P&L / IRR values in table cells */
export function pnlColorClass(value: number | null): string {
  return value === null || value === 0
    ? ""
    : value > 0
      ? "text-emerald-600"
      : "text-red-600";
}

/** Returns direction enum for MetricCard pnlDirection prop */
export function pnlDirection(value: number | null): "positive" | "negative" | null {
  return value === null || value === 0
    ? null
    : value > 0
      ? "positive"
      : "negative";
}
