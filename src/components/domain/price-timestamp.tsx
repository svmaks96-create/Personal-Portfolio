"use client";

import { format } from "date-fns";
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
    return <span className="text-[12px] font-normal text-muted-foreground">Refreshing...</span>;
  }

  if (refreshError) {
    if (timestamp) {
      const dateStr = formatTimestampDate(timestamp);
      return (
        <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-amber-500 dark:text-amber-400">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
          Unable to refresh — last prices from {dateStr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-amber-500 dark:text-amber-400">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
        Unable to refresh — please try again.
      </span>
    );
  }

  if (!timestamp) {
    return <span className="text-[12px] font-normal text-muted-foreground">No price data</span>;
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const isStale = timestamp !== todayStr;
  const dateStr = formatTimestampDate(timestamp);

  if (isStale) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-normal text-amber-500 dark:text-amber-400">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-400" />
        Prices as of {dateStr} close
      </span>
    );
  }

  return (
    <span className="text-[12px] font-normal text-muted-foreground">
      Prices as of {dateStr} close
    </span>
  );
}
