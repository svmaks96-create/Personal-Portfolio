"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PositionSwitcherProps {
  ticker: string;
  allTickers: string[];
  prevTicker: string | null;
  nextTicker: string | null;
}

export function PositionSwitcher({
  ticker,
  allTickers,
  prevTicker,
  nextTicker,
}: PositionSwitcherProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const portfolio = searchParams.get("portfolio");

  function navigate(target: string) {
    const qs = portfolio
      ? `?portfolio=${encodeURIComponent(portfolio)}`
      : "";
    router.push(`/positions/${encodeURIComponent(target)}${qs}`);
  }

  const idx = allTickers.indexOf(ticker);
  const positionLabel =
    idx >= 0 ? `${idx + 1} of ${allTickers.length}` : `${allTickers.length}`;

  return (
    <div className="flex items-center gap-3 border-b border-line-soft bg-background py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
      <span>Position →</span>
      <select
        value={ticker}
        onChange={(e) => navigate(e.target.value)}
        className="border border-line bg-panel px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground"
      >
        {allTickers.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <span>{positionLabel}</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => prevTicker && navigate(prevTicker)}
          disabled={!prevTicker}
          className="inline-flex items-center gap-1 border border-line bg-panel px-2.5 py-1 text-foreground transition-colors hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3 w-3" /> Prev
        </button>
        <button
          type="button"
          onClick={() => nextTicker && navigate(nextTicker)}
          disabled={!nextTicker}
          className="inline-flex items-center gap-1 border border-line bg-panel px-2.5 py-1 text-foreground transition-colors hover:bg-panel-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next <ChevronRight className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
