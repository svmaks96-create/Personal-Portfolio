"use client";

import { useState } from "react";
import { refreshPrices, refreshFxRates } from "@/server/actions/market-data";
import { PortfolioSelector } from "@/components/domain/portfolio-selector";
import { RefreshButton } from "@/components/domain/refresh-button";
import { PriceTimestamp } from "@/components/domain/price-timestamp";

interface ControlsBarProps {
  portfolios: string[];
  selectedPortfolio: string | undefined;
  timestamp: string | null;
}

export function ControlsBar({
  portfolios,
  selectedPortfolio,
  timestamp,
}: ControlsBarProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshError(null);

    try {
      // Next.js dispatches server actions sequentially — call one after the other
      const pricesResult = await refreshPrices();
      const fxResult = await refreshFxRates();

      const pricesFailed = !pricesResult?.success;
      const fxFailed = !fxResult?.success;

      if (pricesFailed || fxFailed) {
        const errors: string[] = [];
        if (pricesFailed) {
          errors.push((pricesResult as { error: string }).error ?? "Unable to refresh prices.");
        }
        if (fxFailed) {
          errors.push((fxResult as { error: string }).error ?? "Unable to refresh FX rates.");
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
    <div className="flex items-center gap-4">
      <PortfolioSelector
        portfolios={portfolios}
        selectedPortfolio={selectedPortfolio}
      />
      <RefreshButton isRefreshing={isRefreshing} onRefresh={handleRefresh} />
      <PriceTimestamp
        timestamp={timestamp}
        isRefreshing={isRefreshing}
        refreshError={refreshError}
      />
    </div>
  );
}
