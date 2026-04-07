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
      className="inline-flex items-center gap-1.5 rounded-md border border-zinc-900 bg-white px-3.5 py-1.5 text-[13px] font-medium text-zinc-900 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50"
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
