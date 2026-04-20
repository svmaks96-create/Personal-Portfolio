"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { PERIODS, type Period } from "@/shared/schemas/period";

interface PeriodSelectorProps {
  currentPeriod: Period;
}

export function PeriodSelector({ currentPeriod }: PeriodSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function handleSelect(period: Period) {
    if (period === currentPeriod) return;
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (period === "ITD") {
        params.delete("period");
      } else {
        params.set("period", period);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div
      role="group"
      aria-label="Time period"
      className="flex border border-line font-mono"
    >
      {PERIODS.map((p) => {
        const active = p === currentPeriod;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => handleSelect(p)}
            className={cn(
              "border-r border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors last:border-r-0",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-pill-bg hover:text-foreground"
            )}
          >
            {p}
          </button>
        );
      })}
    </div>
  );
}
