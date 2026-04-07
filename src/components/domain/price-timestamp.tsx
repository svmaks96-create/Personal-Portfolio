"use client";

import { parseISO, isToday } from "date-fns";
import { formatTimestampDate } from "@/lib/formatting";

interface PriceTimestampProps {
  timestamp: string | null;
  isRefreshing: boolean;
  refreshError: string | null;
}

export function PriceTimestamp({
  timestamp,
  isRefreshing,
  refreshError,
}: PriceTimestampProps) {
  if (isRefreshing) {
    return <span className="text-[12px] font-normal text-zinc-500">Refreshing...</span>;
  }

  if (refreshError && timestamp) {
    const dateStr = formatTimestampDate(timestamp);
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-amber-500">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        Unable to refresh — last prices from {dateStr}
      </span>
    );
  }

  if (!timestamp) {
    return <span className="text-[12px] font-normal text-zinc-500">No price data</span>;
  }

  const isStale = !isToday(parseISO(timestamp));
  const dateStr = formatTimestampDate(timestamp);

  if (isStale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-amber-500">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
        Prices as of {dateStr} close
      </span>
    );
  }

  return (
    <span className="text-[12px] font-normal text-zinc-500">
      Prices as of {dateStr} close
    </span>
  );
}
