export function formatCurrency(value: number, currency = "USD"): string {
  return `${currency} ${value.toFixed(2)}`;
}

export function formatShares(value: number): string {
  return value.toFixed(4);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatPnL(value: number, currency = "USD"): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${currency} ${value.toFixed(2)}`;
}
