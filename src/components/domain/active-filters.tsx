import Link from "next/link";

interface ActiveFiltersProps {
  ticker?: string;
  portfolio?: string;
}

export function ActiveFilters({ ticker, portfolio }: ActiveFiltersProps) {
  if (!ticker && !portfolio) return null;

  const parts: string[] = [];
  if (ticker) parts.push(ticker);
  if (portfolio) parts.push(portfolio);

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Filtered by: {parts.join(" \u00b7 ")}</span>
      <Link
        href="/transactions"
        className="text-foreground underline underline-offset-2 hover:text-foreground/80"
      >
        Clear
      </Link>
    </div>
  );
}
