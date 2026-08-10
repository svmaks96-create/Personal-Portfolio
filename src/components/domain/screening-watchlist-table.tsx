"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { setWatchlistStatus, flagForResearch } from "@/server/actions/screening";
import type { WatchlistRow } from "@/server/queries/screening";
import type { WatchlistStatus } from "@/shared/schemas/screening";

const DASH = "—";

interface ScreeningWatchlistTableProps {
  rows: WatchlistRow[];
}

export function ScreeningWatchlistTable({ rows }: ScreeningWatchlistTableProps) {
  const [busyTicker, setBusyTicker] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  async function transition(ticker: string, status: WatchlistStatus) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusyTicker(ticker);
    setError(null);
    try {
      const result =
        status === "flagged_for_research"
          ? await flagForResearch(ticker)
          : await setWatchlistStatus(ticker, status);
      if (!result.success) {
        setError(`${ticker}: ${result.error}`);
      }
    } finally {
      busyRef.current = false;
      setBusyTicker(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="border border-line bg-panel px-3.5 py-10 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
        Watchlist is empty — flag names from a screening run
      </div>
    );
  }

  return (
    <div className="border border-line bg-panel">
      <table className="w-full table-fixed font-mono tabular-nums">
        <thead>
          <tr className="border-b border-line bg-panel-strong text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
            <th className="w-[90px] px-3.5 py-2 text-left font-normal">Ticker</th>
            <th className="w-[150px] px-3.5 py-2 text-left font-normal">Status</th>
            <th className="w-[80px] px-3.5 py-2 text-center font-normal">Held</th>
            <th className="w-[90px] px-3.5 py-2 text-center font-normal">Thesis</th>
            <th className="px-3.5 py-2 text-right font-normal">Flagged</th>
            <th className="px-3.5 py-2 text-right font-normal">Buy-eligible</th>
            <th className="w-[30%] px-3.5 py-2 text-left font-normal">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.ticker}
              className="border-b border-line text-[12px] last:border-b-0"
            >
              <td className="px-3.5 py-[7px] font-semibold">{row.ticker}</td>
              <td className="px-3.5 py-[7px]">
                <span
                  className={cn(
                    "inline-block border px-1.5 text-[9px] uppercase tracking-[0.12em]",
                    row.status === "watchlisted"
                      ? "border-pos text-pos"
                      : row.status === "rejected"
                        ? "border-neg text-neg"
                        : "border-line text-muted-foreground",
                  )}
                >
                  {row.status.replace(/_/g, " ")}
                </span>
              </td>
              <td className="px-3.5 py-[7px] text-center text-muted-foreground">
                {row.isHeld ? "yes" : "no"}
              </td>
              <td className="px-3.5 py-[7px] text-center">
                {row.thesisStatus === "none" ? (
                  <span className="text-muted-foreground">{DASH}</span>
                ) : (
                  <Link
                    href={
                      row.thesisStatus === "draft"
                        ? "/research"
                        : `/positions/${row.ticker}`
                    }
                    className="underline decoration-line underline-offset-2 hover:decoration-foreground"
                  >
                    {row.thesisStatus}
                  </Link>
                )}
              </td>
              <td className="px-3.5 py-[7px] text-right text-[11px] text-muted-foreground">
                {row.flaggedAt.display}
              </td>
              <td
                className={cn(
                  "px-3.5 py-[7px] text-right text-[11px]",
                  row.coolingActive ? "text-[var(--warn)]" : "text-muted-foreground",
                )}
              >
                {row.buyEligible.display}
                {row.coolingActive ? " (cooling)" : ""}
              </td>
              <td className="px-3.5 py-[7px]">
                <div className="flex flex-wrap gap-1.5">
                  {row.status === "flagged_for_research" && (
                    <>
                      <span className="text-[10px] text-muted-foreground">
                        run /underwrite-name {row.ticker}
                      </span>
                      <ActionButton
                        label="Unflag"
                        busy={busyTicker === row.ticker}
                        onClick={() => transition(row.ticker, "candidate")}
                      />
                    </>
                  )}
                  {(row.status === "candidate" || row.status === "rejected") && (
                    <ActionButton
                      label="Re-flag"
                      busy={busyTicker === row.ticker}
                      onClick={() => transition(row.ticker, "flagged_for_research")}
                    />
                  )}
                  {row.status === "researched" && (
                    <span className="text-[10px] text-muted-foreground">
                      draft pending — finalize at /research
                    </span>
                  )}
                  {row.status !== "rejected" && (
                    <ActionButton
                      label="Reject"
                      tone="neg"
                      busy={busyTicker === row.ticker}
                      onClick={() => transition(row.ticker, "rejected")}
                    />
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && (
        <div className="border-t border-neg px-3.5 py-2 font-mono text-[11px] text-neg">
          {error}
        </div>
      )}
    </div>
  );
}

function ActionButton({
  label,
  busy,
  onClick,
  tone,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
  tone?: "neg";
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "border px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.14em] disabled:opacity-35",
        tone === "neg"
          ? "border-neg text-neg hover:bg-panel-strong"
          : "border-line text-muted-foreground hover:text-foreground",
      )}
    >
      {busy ? "…" : label}
    </button>
  );
}
