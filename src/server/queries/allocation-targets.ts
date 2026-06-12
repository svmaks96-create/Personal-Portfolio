import { db } from "@/server/db";
import { allocationTargets } from "@/server/db/schema";
import { asc, desc } from "drizzle-orm";
import {
  formatCurrency,
  formatIRR,
  formatPercent,
  formatPnL,
  formatSharesDelta,
} from "@/lib/formatting";
import Decimal from "decimal.js";
import type { AllocationKind } from "@/shared/schemas/allocation-target";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { mergePositionsByTicker } from "@/server/services/computation";
import { getCashTargetWeight } from "@/server/queries/app-settings";

const DASH = "—";

export interface AllocationTargetRow {
  id: number;
  kind: AllocationKind;
  name: { value: string; display: string };
  targetWeight: { value: number | null; display: string };
  positionValue: { value: number | null; display: string };
  cashAmountUsd: { value: number | null; display: string };
  realWeight: { value: number | null; display: string };
  realWeightDiff: { value: number | null; display: string };
  deltaShares: { value: number | null; display: string };
  deltaValue: { value: number | null; display: string };
  sortOrder: number;
}

export interface CashAggregate {
  targetWeight: { value: number; display: string };
  totalCash: { value: number; display: string };
  realWeight: { value: number | null; display: string };
  diff: { value: number | null; display: string };
  deltaValue: { value: number | null; display: string };
}

export interface AllocationModel {
  rows: AllocationTargetRow[];
  totalTargetWeight: number;
  totalCashUsd: number;
  cashAggregate: CashAggregate;
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

  let cashSum = new Decimal(0);
  let tickerTargetSum = new Decimal(0);
  for (const row of rows) {
    if (row.kind === "ticker") {
      tickerTargetSum = tickerTargetSum.plus(row.targetWeight);
    } else if (row.cashAmountUsd !== null) {
      cashSum = cashSum.plus(row.cashAmountUsd);
    }
  }
  const totalCashUsd = cashSum.toNumber();
  const cashAggregateTarget = getCashTargetWeight();
  const totalTargetWeight = tickerTargetSum.plus(cashAggregateTarget).toNumber();

  // Build a ticker -> market-value map from merged (cross-portfolio) active positions.
  // fetchPositionInputs is React-cached, so this is free when the dashboard already ran.
  const { txInputs, fxRates, today, positions } = fetchPositionInputs();
  const merged = mergePositionsByTicker(positions, txInputs, fxRates, today);
  const activeMerged = merged.filter((p) => !p.isClosed);

  const marketValueByTicker = new Map<string, number | null>();
  const usdPriceByTicker = new Map<string, number | null>();
  let positionsValueSum = new Decimal(0);
  for (const pos of activeMerged) {
    // Option positions count toward total portfolio value (the denominator)
    // but never represent the underlying's per-ticker stock value — an option
    // row must not clobber the stock row's market value for the same ticker.
    if (pos.instrument === "stock") {
      marketValueByTicker.set(pos.ticker, pos.marketValue);
      if (pos.sharesHeld > 0 && pos.marketValue !== null) {
        usdPriceByTicker.set(
          pos.ticker,
          new Decimal(pos.marketValue).div(pos.sharesHeld).toNumber(),
        );
      } else {
        usdPriceByTicker.set(pos.ticker, null);
      }
    }
    if (pos.marketValue !== null) {
      positionsValueSum = positionsValueSum.plus(pos.marketValue);
    }
  }

  const totalPortfolioValue = positionsValueSum.plus(totalCashUsd);
  const hasPortfolioValue = totalPortfolioValue.greaterThan(0);

  const mapped: AllocationTargetRow[] = rows.map((row) => {
    if (row.kind === "ticker") {
      return mapTickerRow(
        row,
        marketValueByTicker,
        usdPriceByTicker,
        totalPortfolioValue,
        hasPortfolioValue,
      );
    }
    return mapCashRow(row, totalPortfolioValue, hasPortfolioValue);
  });

  const cashAggregate = buildCashAggregate(
    cashAggregateTarget,
    totalCashUsd,
    totalPortfolioValue,
    hasPortfolioValue,
  );

  return {
    rows: mapped,
    totalTargetWeight,
    totalCashUsd,
    cashAggregate,
  };
}

function mapTickerRow(
  row: typeof allocationTargets.$inferSelect,
  marketValueByTicker: Map<string, number | null>,
  usdPriceByTicker: Map<string, number | null>,
  totalPortfolioValue: Decimal,
  hasPortfolioValue: boolean,
): AllocationTargetRow {
  const lookup = marketValueByTicker.get(row.name);
  // undefined = not held in any portfolio → treat as $0 position
  // null     = held but no price → can't price this slot at all
  // number   = held with valid market value
  const marketValue = lookup === undefined ? 0 : lookup;

  let realValue: number | null = null;
  if (hasPortfolioValue && marketValue !== null) {
    realValue = new Decimal(marketValue)
      .div(totalPortfolioValue)
      .times(100)
      .toNumber();
  }

  const diffValue =
    realValue === null
      ? null
      : new Decimal(realValue).minus(row.targetWeight).toNumber();

  let deltaValue: number | null = null;
  if (hasPortfolioValue && marketValue !== null) {
    const targetValue = totalPortfolioValue.times(row.targetWeight).div(100);
    deltaValue = targetValue.minus(marketValue).toNumber();
  }

  const lastPriceUsd = usdPriceByTicker.get(row.name) ?? null;
  const deltaShares =
    deltaValue !== null && lastPriceUsd !== null && lastPriceUsd > 0
      ? new Decimal(deltaValue).div(lastPriceUsd).toNumber()
      : null;

  return {
    id: row.id,
    kind: row.kind,
    name: { value: row.name, display: row.name },
    targetWeight: {
      value: row.targetWeight,
      display: formatPercent(row.targetWeight),
    },
    positionValue: {
      value: marketValue,
      display: formatCurrency(marketValue),
    },
    cashAmountUsd: { value: null, display: DASH },
    realWeight: {
      value: realValue,
      display: formatPercent(realValue),
    },
    realWeightDiff: {
      value: diffValue,
      display: formatIRR(diffValue),
    },
    deltaShares: {
      value: deltaShares,
      display: formatSharesDelta(deltaShares),
    },
    deltaValue: {
      value: deltaValue,
      display: formatPnL(deltaValue),
    },
    sortOrder: row.sortOrder,
  };
}

function mapCashRow(
  row: typeof allocationTargets.$inferSelect,
  totalPortfolioValue: Decimal,
  hasPortfolioValue: boolean,
): AllocationTargetRow {
  // Target / diff / deltas live on the aggregate footer row, but each cash
  // account still has a per-row real weight worth surfacing.
  let realValue: number | null = null;
  if (hasPortfolioValue && row.cashAmountUsd !== null) {
    realValue = new Decimal(row.cashAmountUsd)
      .div(totalPortfolioValue)
      .times(100)
      .toNumber();
  }

  return {
    id: row.id,
    kind: row.kind,
    name: { value: row.name, display: row.name },
    targetWeight: { value: null, display: DASH },
    positionValue: { value: null, display: DASH },
    cashAmountUsd: {
      value: row.cashAmountUsd,
      display:
        row.cashAmountUsd === null ? DASH : formatCurrency(row.cashAmountUsd),
    },
    realWeight: {
      value: realValue,
      display: formatPercent(realValue),
    },
    realWeightDiff: { value: null, display: DASH },
    deltaShares: { value: null, display: DASH },
    deltaValue: { value: null, display: DASH },
    sortOrder: row.sortOrder,
  };
}

function buildCashAggregate(
  cashAggregateTarget: number,
  totalCashUsd: number,
  totalPortfolioValue: Decimal,
  hasPortfolioValue: boolean,
): CashAggregate {
  let realWeight: number | null = null;
  let diff: number | null = null;
  let deltaValue: number | null = null;

  if (hasPortfolioValue) {
    realWeight = new Decimal(totalCashUsd)
      .div(totalPortfolioValue)
      .times(100)
      .toNumber();
    diff = new Decimal(realWeight).minus(cashAggregateTarget).toNumber();
    const targetCashValue = totalPortfolioValue.times(cashAggregateTarget).div(100);
    deltaValue = targetCashValue.minus(totalCashUsd).toNumber();
  }

  return {
    targetWeight: {
      value: cashAggregateTarget,
      display: formatPercent(cashAggregateTarget),
    },
    totalCash: {
      value: totalCashUsd,
      display: formatCurrency(totalCashUsd),
    },
    realWeight: {
      value: realWeight,
      display: formatPercent(realWeight),
    },
    diff: {
      value: diff,
      display: formatIRR(diff),
    },
    deltaValue: {
      value: deltaValue,
      display: formatPnL(deltaValue),
    },
  };
}
