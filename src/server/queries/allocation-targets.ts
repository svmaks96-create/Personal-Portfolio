import { db } from "@/server/db";
import { allocationTargets } from "@/server/db/schema";
import { asc, desc } from "drizzle-orm";
import { formatCurrency, formatIRR, formatPercent } from "@/lib/formatting";
import Decimal from "decimal.js";
import type { AllocationKind } from "@/shared/schemas/allocation-target";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { mergePositionsByTicker } from "@/server/services/computation";

const DASH = "—";

export interface AllocationTargetRow {
  id: number;
  kind: AllocationKind;
  name: { value: string; display: string };
  targetWeight: { value: number; display: string };
  cashAmountUsd: { value: number | null; display: string };
  realWeight: { value: number | null; display: string };
  realWeightDiff: { value: number | null; display: string };
  sortOrder: number;
}

export interface AllocationModel {
  rows: AllocationTargetRow[];
  totalTargetWeight: number;
  totalCashUsd: number;
}

export function getAllocationModel(): AllocationModel {
  const rows = db
    .select()
    .from(allocationTargets)
    .orderBy(
      desc(allocationTargets.kind),
      asc(allocationTargets.sortOrder),
      asc(allocationTargets.name),
    )
    .all();

  let targetSum = new Decimal(0);
  let cashSum = new Decimal(0);
  for (const row of rows) {
    targetSum = targetSum.plus(row.targetWeight);
    if (row.kind === "cash" && row.cashAmountUsd !== null) {
      cashSum = cashSum.plus(row.cashAmountUsd);
    }
  }
  const totalCashUsd = cashSum.toNumber();

  // Build a ticker -> market-value map from merged (cross-portfolio) active positions.
  // fetchPositionInputs is React-cached, so this is free when the dashboard already ran.
  const { txInputs, fxRates, today, positions } = fetchPositionInputs();
  const merged = mergePositionsByTicker(positions, txInputs, fxRates, today);
  const activeMerged = merged.filter((p) => !p.isClosed);

  const marketValueByTicker = new Map<string, number | null>();
  let positionsValueSum = new Decimal(0);
  for (const pos of activeMerged) {
    marketValueByTicker.set(pos.ticker, pos.marketValue);
    if (pos.marketValue !== null) {
      positionsValueSum = positionsValueSum.plus(pos.marketValue);
    }
  }

  const totalPortfolioValue = positionsValueSum.plus(totalCashUsd);
  const hasPortfolioValue = totalPortfolioValue.greaterThan(0);

  const mapped: AllocationTargetRow[] = rows.map((row) => {
    let realValue: number | null = null;
    if (hasPortfolioValue) {
      if (row.kind === "ticker") {
        const mv = marketValueByTicker.get(row.name);
        if (mv === undefined) {
          // Ticker listed in allocation but not held in any portfolio → 0%.
          realValue = 0;
        } else if (mv !== null) {
          realValue = new Decimal(mv).div(totalPortfolioValue).times(100).toNumber();
        }
      } else if (row.cashAmountUsd !== null) {
        realValue = new Decimal(row.cashAmountUsd)
          .div(totalPortfolioValue)
          .times(100)
          .toNumber();
      }
    }

    const diffValue =
      realValue === null
        ? null
        : new Decimal(realValue).minus(row.targetWeight).toNumber();

    return {
      id: row.id,
      kind: row.kind,
      name: { value: row.name, display: row.name },
      targetWeight: {
        value: row.targetWeight,
        display: formatPercent(row.targetWeight),
      },
      cashAmountUsd: {
        value: row.cashAmountUsd,
        display:
          row.cashAmountUsd === null ? DASH : formatCurrency(row.cashAmountUsd),
      },
      realWeight: {
        value: realValue,
        display: formatPercent(realValue),
      },
      realWeightDiff: {
        value: diffValue,
        display: formatIRR(diffValue),
      },
      sortOrder: row.sortOrder,
    };
  });

  return {
    rows: mapped,
    totalTargetWeight: targetSum.toNumber(),
    totalCashUsd,
  };
}
