"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  ANALYTICS_WINDOWS,
  DEFAULT_ANALYTICS_WINDOW,
  type AnalyticsWindow,
} from "@/shared/schemas/analytics-window";

interface AnalyticsWindowSelectorProps {
  currentWindow: AnalyticsWindow;
}

export function AnalyticsWindowSelector({
  currentWindow,
}: AnalyticsWindowSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function handleSelect(next: AnalyticsWindow) {
    if (next === currentWindow) return;
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (next === DEFAULT_ANALYTICS_WINDOW) {
        params.delete("window");
      } else {
        params.set("window", next);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div
      role="group"
      aria-label="Analysis window"
      className="flex border border-line font-mono"
    >
      {ANALYTICS_WINDOWS.map((w) => {
        const active = w === currentWindow;
        return (
          <button
            key={w}
            type="button"
            aria-pressed={active}
            onClick={() => handleSelect(w)}
            className={cn(
              "border-r border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors last:border-r-0",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-pill-bg hover:text-foreground"
            )}
          >
            {w}
          </button>
        );
      })}
    </div>
  );
}
