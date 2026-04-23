import { db } from "@/server/db";
import { allocationTargets } from "@/server/db/schema";
import { asc, desc } from "drizzle-orm";
import { formatCurrency, formatPercent } from "@/lib/formatting";
import Decimal from "decimal.js";
import type { AllocationKind } from "@/shared/schemas/allocation-target";

const DASH = "—";

export interface AllocationTargetRow {
  id: number;
  kind: AllocationKind;
  name: { value: string; display: string };
  targetWeight: { value: number; display: string };
  cashAmountUsd: { value: number | null; display: string };
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

  const mapped: AllocationTargetRow[] = rows.map((row) => {
    targetSum = targetSum.plus(row.targetWeight);
    if (row.kind === "cash" && row.cashAmountUsd !== null) {
      cashSum = cashSum.plus(row.cashAmountUsd);
    }

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
      sortOrder: row.sortOrder,
    };
  });

  return {
    rows: mapped,
    totalTargetWeight: targetSum.toNumber(),
    totalCashUsd: cashSum.toNumber(),
  };
}
