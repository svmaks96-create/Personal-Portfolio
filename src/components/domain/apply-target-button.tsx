"use client";

import { useState, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { applyTargetToAllocation } from "@/server/actions/theses";
import { formatPercent } from "@/lib/formatting";

interface ApplyTargetButtonProps {
  ticker: string;
  preview: {
    weightBefore: number;
    weightAfter: number;
    cashBefore: number;
    cashAfter: number;
  };
}

/**
 * The confirm dialog for the only automated path that touches allocation
 * weights — shows the exact before/after for the name and the cash residual.
 */
export function ApplyTargetButton({ ticker, preview }: ApplyTargetButtonProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const applyingRef = useRef(false);

  async function handleConfirm() {
    if (applyingRef.current) return;
    applyingRef.current = true;
    setIsApplying(true);
    setError(null);
    try {
      const result = await applyTargetToAllocation(ticker);
      if (result.success) {
        setOpen(false);
      } else {
        setError(result.error);
      }
    } finally {
      applyingRef.current = false;
      setIsApplying(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        className="border border-foreground bg-foreground px-2.5 py-[3px] font-mono text-[9px] uppercase tracking-[0.16em] text-background hover:opacity-90"
      >
        Apply
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Apply {ticker} target to /allocation
            </AlertDialogTitle>
            <AlertDialogDescription>
              Σ ticker weights + cash stays 100. Advisory only — no orders are
              placed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 font-mono text-[13px] tabular-nums">
            <div>
              {ticker}: {formatPercent(preview.weightBefore)} →{" "}
              <span className="font-semibold">
                {formatPercent(preview.weightAfter)}
              </span>
            </div>
            <div>
              Cash target: {formatPercent(preview.cashBefore)} →{" "}
              <span className="font-semibold">
                {formatPercent(preview.cashAfter)}
              </span>
            </div>
            {error && <div className="text-[11px] text-neg">{error}</div>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isApplying} onClick={handleConfirm}>
              {isApplying ? "Applying…" : "Apply target"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
