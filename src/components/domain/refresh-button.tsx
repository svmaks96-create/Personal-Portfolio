"use client";

import { Loader2, RefreshCw } from "lucide-react";

interface RefreshButtonProps {
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function RefreshButton({ isRefreshing, onRefresh }: RefreshButtonProps) {
  return (
    <button
      onClick={onRefresh}
      disabled={isRefreshing}
      className="inline-flex items-center gap-1.5 rounded-md border border-foreground bg-card px-3.5 py-1.5 text-[13px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
    >
      {isRefreshing ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="h-4 w-4" />
      )}
      Refresh
    </button>
  );
}
