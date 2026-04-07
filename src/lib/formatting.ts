import { format, parseISO } from "date-fns";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const sharesFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const percentFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function formatCurrency(value: number | null): string {
  if (value === null) return "N/A";
  return currencyFormatter.format(value);
}

export function formatShares(value: number | null): string {
  if (value === null) return "N/A";
  return sharesFormatter.format(value);
}

export function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${percentFormatter.format(value)}%`;
}

export function formatPnL(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = currencyFormatter.format(Math.abs(value));
  if (value >= 0) return `+${formatted}`;
  return `-${formatted}`;
}

export function formatDate(date: string): string {
  return format(parseISO(date), "MMM d, yyyy");
}
