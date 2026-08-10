"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  saveRiskScenario,
  deleteRiskScenario,
} from "@/server/actions/risk-scenarios";
import { cn } from "@/lib/utils";

interface RiskScenarioFormProps {
  customWindows: { key: string; label: string; from: string; to: string }[];
}

const inputClass =
  "border border-line bg-transparent px-1.5 py-1 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/40";

/** Add or remove custom replay windows. */
export function RiskScenarioForm({ customWindows }: RiskScenarioFormProps) {
  const router = useRouter();
  const [label, setLabel] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function add() {
    startTransition(async () => {
      const result = await saveRiskScenario({ label, from, to });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      setLabel("");
      setFrom("");
      setTo("");
      router.refresh();
    });
  }

  function remove(key: string) {
    startTransition(async () => {
      const result = await deleteRiskScenario(key);
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className={cn("space-y-3", isPending && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="window name"
          maxLength={60}
          aria-label="Scenario name"
          className={cn(inputClass, "w-40")}
        />
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          aria-label="Window start"
          className={inputClass}
        />
        <span className="font-mono text-[11px] text-muted-foreground">→</span>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          aria-label="Window end"
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          className="border border-line px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
        >
          Add
        </button>
      </div>
      {error ? (
        <p className="font-mono text-[10px] text-neg">{error}</p>
      ) : null}

      {customWindows.length > 0 ? (
        <div className="space-y-1.5 border-t border-line-soft pt-2.5">
          {customWindows.map((window) => (
            <div
              key={window.key}
              className="flex items-center justify-between gap-2 font-mono text-[11px]"
            >
              <span className="text-foreground">
                {window.label}
                <span className="ml-2 text-muted-foreground">
                  {window.from} → {window.to}
                </span>
              </span>
              <button
                type="button"
                onClick={() => remove(window.key)}
                aria-label={`Remove ${window.label}`}
                className="border border-line px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-pill-bg hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
