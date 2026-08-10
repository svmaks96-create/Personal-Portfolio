"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  RISK_UNIVERSES,
  RISK_WINDOWS,
  DEFAULT_RISK_UNIVERSE,
  DEFAULT_RISK_WINDOW,
  type RiskUniverse,
  type RiskWindow,
} from "@/shared/schemas/risk-view";

interface RiskViewSelectorProps {
  currentUniverse: RiskUniverse;
  currentWindow: RiskWindow;
}

const UNIVERSE_SHORT: Record<RiskUniverse, string> = {
  all: "All",
  stocks: "Stocks",
  etfs: "ETFs",
};

/** Universe and window switchers for /risk, persisted in search params. */
export function RiskViewSelector({
  currentUniverse,
  currentWindow,
}: RiskViewSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function navigate(key: "universe" | "window", value: string, isDefault: boolean) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (isDefault) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <div
        role="group"
        aria-label="Universe"
        className="flex border border-line font-mono"
      >
        {RISK_UNIVERSES.map((universe) => {
          const active = universe === currentUniverse;
          return (
            <button
              key={universe}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (universe !== currentUniverse) {
                  navigate("universe", universe, universe === DEFAULT_RISK_UNIVERSE);
                }
              }}
              className={cn(
                "border-r border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors last:border-r-0",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-pill-bg hover:text-foreground"
              )}
            >
              {UNIVERSE_SHORT[universe]}
            </button>
          );
        })}
      </div>
      <div
        role="group"
        aria-label="Measurement window"
        className="flex border border-line font-mono"
      >
        {RISK_WINDOWS.map((window) => {
          const active = window === currentWindow;
          return (
            <button
              key={window}
              type="button"
              aria-pressed={active}
              onClick={() => {
                if (window !== currentWindow) {
                  navigate("window", window, window === DEFAULT_RISK_WINDOW);
                }
              }}
              className={cn(
                "border-r border-line px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] transition-colors last:border-r-0",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-pill-bg hover:text-foreground"
              )}
            >
              {window}
            </button>
          );
        })}
      </div>
    </div>
  );
}
