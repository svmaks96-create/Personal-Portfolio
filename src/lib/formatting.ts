import { format, parseISO } from "date-fns";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const currencyRoundedFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const amountFormatter = new Intl.NumberFormat("en-US", {
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

const percentRoundedFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatCurrency(value: number | null): string {
  if (value === null) return "N/A";
  return currencyFormatter.format(value);
}

export function formatCurrencyRounded(value: number | null): string {
  if (value === null) return "N/A";
  return currencyRoundedFormatter.format(value);
}

export function formatShares(value: number | null): string {
  if (value === null) return "N/A";
  return sharesFormatter.format(value);
}

export function formatSharesDelta(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = sharesFormatter.format(Math.abs(value));
  if (value >= 0) return `+${formatted}`;
  return `-${formatted}`;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "N/A";
  return `${percentFormatter.format(value)}%`;
}

export function formatAmount(value: number | null): string {
  if (value === null) return "N/A";
  return amountFormatter.format(value);
}

export function formatPnL(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = currencyFormatter.format(Math.abs(value));
  if (value >= 0) return `+${formatted}`;
  return `-${formatted}`;
}

export function formatPnLRounded(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = currencyRoundedFormatter.format(Math.abs(value));
  if (value >= 0) return `+${formatted}`;
  return `-${formatted}`;
}

export function formatDate(date: string | null): string {
  if (date === null) return "N/A";
  return format(parseISO(date), "MMM d, yyyy");
}

export function formatIRR(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = percentFormatter.format(Math.abs(value));
  if (value >= 0) return `+${formatted}%`;
  return `-${formatted}%`;
}

export function formatIRRRounded(value: number | null): string {
  if (value === null) return "N/A";
  const formatted = percentRoundedFormatter.format(Math.abs(value));
  if (value >= 0) return `+${formatted}%`;
  return `-${formatted}%`;
}

export function formatTimestampDate(isoTimestamp: string): string {
  return format(parseISO(isoTimestamp), "MMM d");
}

export function formatPriceDate(date: string | null): string {
  if (date === null) return "N/A";
  return format(parseISO(date), "MMM d");
}
