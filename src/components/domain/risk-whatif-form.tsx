"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

interface RiskWhatIfFormProps {
  tickers: string[];
  currentFrom?: string;
  currentTo?: string;
  currentAmountUsd?: number;
}

const selectClass =
  "border border-line bg-transparent px-1.5 py-1 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-foreground/40";

/**
 * Trim-X-add-Y scenario input. State lives in search params so the server
 * computes the scenario — no client math.
 */
export function RiskWhatIfForm({
  tickers,
  currentFrom,
  currentTo,
  currentAmountUsd,
}: RiskWhatIfFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [from, setFrom] = useState(currentFrom ?? "");
  const [to, setTo] = useState(currentTo ?? "");
  const [amount, setAmount] = useState(String(currentAmountUsd ?? 10_000));

  function apply() {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      const amountNumber = Number(amount);
      if (from && to && from !== to && Number.isFinite(amountNumber) && amountNumber > 0) {
        params.set("wiFrom", from);
        params.set("wiTo", to);
        params.set("wiAmt", String(Math.round(amountNumber)));
      } else {
        params.delete("wiFrom");
        params.delete("wiTo");
        params.delete("wiAmt");
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  function clear() {
    setFrom("");
    setTo("");
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("wiFrom");
      params.delete("wiTo");
      params.delete("wiAmt");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  const hasScenario = currentFrom !== undefined && currentTo !== undefined;

  return (
    <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
      <span className="text-muted-foreground">trim</span>
      <select
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        aria-label="Ticker to trim"
        className={selectClass}
      >
        <option value="">—</option>
        {tickers.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">add to</span>
      <select
        value={to}
        onChange={(e) => setTo(e.target.value)}
        aria-label="Ticker to add to"
        className={selectClass}
      >
        <option value="">—</option>
        {tickers.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">$</span>
      <input
        type="number"
        min={0}
        step={1000}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        aria-label="Amount in USD"
        className={cn(selectClass, "w-24")}
      />
      <button
        type="button"
        onClick={apply}
        className="border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-foreground hover:text-background"
      >
        Run
      </button>
      {hasScenario ? (
        <button
          type="button"
          onClick={clear}
          className="border border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:bg-pill-bg"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}
