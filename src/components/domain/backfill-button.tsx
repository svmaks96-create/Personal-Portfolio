"use client";

import { useState } from "react";
import { Database, Loader2 } from "lucide-react";
import { backfillHistory } from "@/server/actions/market-data";

export function BackfillButton() {
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  async function handleBackfill() {
    setIsRunning(true);
    setMessage(null);
    setIsError(false);

    try {
      const result = await backfillHistory();
      if (!result.success) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      const { symbolsSucceeded, symbolsAttempted, rowsWritten, symbolsFailed } =
        result.data;
      const failedSuffix =
        symbolsFailed.length > 0
          ? `. Failed: ${symbolsFailed.slice(0, 5).join(", ")}${symbolsFailed.length > 5 ? "…" : ""}`
          : "";
      setMessage(
        `Backfilled ${symbolsSucceeded}/${symbolsAttempted} symbols, ${rowsWritten.toLocaleString()} rows${failedSuffix}.`
      );
    } catch {
      setIsError(true);
      setMessage("Backfill failed — please try again.");
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleBackfill}
        disabled={isRunning}
        title="Fetch full daily price history for held tickers, benchmarks, and FX pairs. Run once after enabling the performance feature."
        className="inline-flex items-center gap-1.5 rounded-md border border-foreground bg-card px-3.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isRunning ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Database className="h-4 w-4" />
        )}
        Backfill history
      </button>
      {message ? (
        <span
          className={
            isError
              ? "text-[12px] text-red-600 dark:text-red-400"
              : "text-[12px] text-muted-foreground"
          }
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
