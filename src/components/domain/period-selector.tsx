"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
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
      // ITD is the default, so keep the URL clean when selected.
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
    <div role="group" aria-label="Time period" className="flex gap-1">
      {PERIODS.map((p) => (
        <Button
          key={p}
          size="sm"
          variant={p === currentPeriod ? "secondary" : "ghost"}
          aria-pressed={p === currentPeriod}
          onClick={() => handleSelect(p)}
        >
          {p}
        </Button>
      ))}
    </div>
  );
}
