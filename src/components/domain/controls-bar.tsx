"use client";

import { useState } from "react";
import {
  refreshTickerProfiles,
  refreshTickerFundamentals,
  refreshPrices,
  refreshFxRates,
  refreshEtfHoldings,
} from "@/server/actions/market-data";
import { RefreshButton } from "@/components/domain/refresh-button";
import { BackfillButton } from "@/components/domain/backfill-button";
import { PriceTimestamp } from "@/components/domain/price-timestamp";

interface ControlsBarProps {
  timestamp: string | null;
}

export function ControlsBar({ timestamp }: ControlsBarProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshError(null);

    try {
      // Next.js dispatches server actions sequentially — call one after the other.
      // Profiles run first so ETF detection and company names are populated
      // before fundamentals (which branches on isEtf) and the page re-renders
      // after price/FX/holdings updates.
      const profilesResult = await refreshTickerProfiles();
      const fundamentalsResult = await refreshTickerFundamentals();
      const pricesResult = await refreshPrices();
      const fxResult = await refreshFxRates();
      const etfResult = await refreshEtfHoldings();

      const profilesFailed = !profilesResult?.success;
      const fundamentalsFailed = !fundamentalsResult?.success;
      const pricesFailed = !pricesResult?.success;
      const fxFailed = !fxResult?.success;
      const etfFailed = !etfResult?.success;

      if (profilesFailed || fundamentalsFailed || pricesFailed || fxFailed || etfFailed) {
        const errors: string[] = [];
        if (profilesFailed) {
          errors.push((profilesResult as { error: string }).error ?? "Unable to refresh ticker profiles.");
        }
        if (fundamentalsFailed) {
          errors.push((fundamentalsResult as { error: string }).error ?? "Unable to refresh fundamentals.");
        }
        if (pricesFailed) {
          errors.push((pricesResult as { error: string }).error ?? "Unable to refresh prices.");
        }
        if (fxFailed) {
          errors.push((fxResult as { error: string }).error ?? "Unable to refresh FX rates.");
        }
        if (etfFailed) {
          errors.push((etfResult as { error: string }).error ?? "Unable to refresh ETF holdings.");
        }
        setRefreshError(errors.join(" "));
      }
    } catch {
      setRefreshError("Unable to refresh — please try again.");
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <RefreshButton isRefreshing={isRefreshing} onRefresh={handleRefresh} />
      <BackfillButton />
      <PriceTimestamp
        timestamp={timestamp}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
      />
    </div>
  );
}
