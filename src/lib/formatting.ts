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

const percentDetailedFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

export function formatPercentDetailed(value: number | null): string {
  if (value === null) return "N/A";
  return `${percentDetailedFormatter.format(value)}%`;
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

const multipleFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

/** Compact USD for large figures: "$4.40T", "$1.23B", "$45.6M", "$12.3K". */
export function formatMarketCap(value: number | null): string {
  if (value === null) return "N/A";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

/** Valuation multiple, e.g. "35.9x", "-2.1x". */
export function formatMultiple(value: number | null): string {
  if (value === null) return "N/A";
  return `${multipleFormatter.format(value)}x`;
}

const moicFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Multiple on invested capital, e.g. "1.25x", "0.80x". */
export function formatMoic(value: number | null): string {
  if (value === null) return "N/A";
  return `${moicFormatter.format(value)}x`;
}

/** Whole-number count with thousands separators, e.g. "164,000". */
export function formatInteger(value: number | null): string {
  if (value === null) return "N/A";
  return integerFormatter.format(value);
}

export function formatTimestampDate(isoTimestamp: string): string {
  return format(parseISO(isoTimestamp), "MMM d");
}

export function formatPriceDate(date: string | null): string {
  if (date === null) return "N/A";
  return format(parseISO(date), "MMM d");
}
