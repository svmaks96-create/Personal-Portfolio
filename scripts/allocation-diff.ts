/**
 * One-shot read-only reconciliation of the allocation target model against the
 * real ledger. Reuses the app's exact computation chain (fetchPositionInputs +
 * mergePositionsByTicker), so market values and real weights match the
 * /allocation page cell-for-cell.
 *
 * Output: JSON to stdout. No writes. Safe to run anytime.
 *
 * Categories:
 *   missingFromModel  - held today, no ticker row in the model
 *   unheldInModel     - model row with no live stock position, split by status:
 *                         "sold"        -> has ledger history, flat now
 *                         "never_owned" -> aspirational / watchlist target
 *   weightIssues      - ticker targets + cash target weight != 100
 */
import { db } from "../src/server/db";
import { allocationTargets } from "../src/server/db/schema";
import { asc, desc } from "drizzle-orm";
import Decimal from "decimal.js";
import { fetchPositionInputs } from "../src/server/queries/shared-position-inputs";
import { mergePositionsByTicker } from "../src/server/services/computation";
import { getCashTargetWeight } from "../src/server/queries/app-settings";

const HELD_EPSILON = 0.01;

const modelRows = db
  .select()
  .from(allocationTargets)
  .orderBy(
    desc(allocationTargets.kind),
    asc(allocationTargets.sortOrder),
    asc(allocationTargets.name)
  )
  .all();

const tickerRows = modelRows.filter((r) => r.kind === "ticker");
const cashRows = modelRows.filter((r) => r.kind === "cash");

// ---- Real portfolio state (identical chain to getAllocationModel) ----------
const { txInputs, fxRates, today, positions } = fetchPositionInputs();
const merged = mergePositionsByTicker(positions, txInputs, fxRates, today);
const active = merged.filter((p) => !p.isClosed);

interface Live {
  stockShares: number;
  stockValue: number | null;
  optionValue: number | null;
}
const live = new Map<string, Live>();
let positionsValueSum = new Decimal(0);

for (const pos of active) {
  const entry = live.get(pos.ticker) ?? {
    stockShares: 0,
    stockValue: null,
    optionValue: null,
  };
  if (pos.instrument === "stock") {
    entry.stockShares = pos.sharesHeld;
    entry.stockValue = pos.marketValue;
  } else {
    entry.optionValue = pos.marketValue;
  }
  live.set(pos.ticker, entry);
  if (pos.marketValue !== null) {
    positionsValueSum = positionsValueSum.plus(pos.marketValue);
  }
}

const totalCashUsd = cashRows.reduce(
  (sum, r) => sum.plus(r.cashAmountUsd ?? 0),
  new Decimal(0)
);
const totalPortfolioValue = positionsValueSum.plus(totalCashUsd);
const hasValue = totalPortfolioValue.greaterThan(0);

function realWeight(value: number | null): number | null {
  if (!hasValue || value === null) return null;
  return new Decimal(value).div(totalPortfolioValue).times(100).toNumber();
}

// ---- Ledger history (to tell "sold" from "never owned") --------------------
interface History {
  everTraded: boolean;
  lastTradeDate: string | null;
  netShares: number;
}
const history = new Map<string, History>();
for (const tx of txInputs) {
  if (tx.instrument !== "stock") continue;
  const h = history.get(tx.ticker) ?? {
    everTraded: false,
    lastTradeDate: null,
    netShares: 0,
  };
  if (tx.action === "buy" || tx.action === "sell") {
    h.everTraded = true;
    h.netShares += tx.action === "buy" ? tx.quantity : -tx.quantity;
    if (h.lastTradeDate === null || tx.date > h.lastTradeDate) {
      h.lastTradeDate = tx.date;
    }
  }
  history.set(tx.ticker, h);
}

// ---- Category 1: held today but absent from the model ---------------------
const modelTickers = new Set(tickerRows.map((r) => r.name));
const missingFromModel = [...live.entries()]
  .filter(([ticker, l]) => {
    if (modelTickers.has(ticker)) return false;
    const hasStock = l.stockShares > HELD_EPSILON;
    const hasOption = l.optionValue !== null && l.optionValue !== 0;
    return hasStock || hasOption;
  })
  .map(([ticker, l]) => ({
    ticker,
    sharesHeld: l.stockShares,
    stockValue: l.stockValue,
    optionValue: l.optionValue,
    realWeightPct: realWeight(l.stockValue),
    optionOnly: l.stockShares <= HELD_EPSILON,
    lastTradeDate: history.get(ticker)?.lastTradeDate ?? null,
  }))
  .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0));

// ---- Category 2: in the model but not held --------------------------------
const unheldInModel = tickerRows
  .filter((r) => (live.get(r.name)?.stockShares ?? 0) <= HELD_EPSILON)
  .map((r) => {
    const h = history.get(r.name);
    const l = live.get(r.name);
    return {
      id: r.id,
      ticker: r.name,
      targetWeight: r.targetWeight,
      status: h?.everTraded ? ("sold" as const) : ("never_owned" as const),
      lastTradeDate: h?.lastTradeDate ?? null,
      optionValue: l?.optionValue ?? null,
      updatedAt: r.updatedAt,
    };
  });

// ---- Category 3: weight arithmetic ----------------------------------------
const cashTargetWeight = getCashTargetWeight();
const tickerTargetSum = tickerRows.reduce(
  (sum, r) => sum.plus(r.targetWeight),
  new Decimal(0)
);
const grandTotal = tickerTargetSum.plus(cashTargetWeight);

// ---- Full current model, with live weights, for the report ----------------
const model = tickerRows.map((r) => {
  const l = live.get(r.name);
  const stockValue = l === undefined ? 0 : l.stockValue;
  const real = realWeight(stockValue);
  return {
    id: r.id,
    ticker: r.name,
    targetWeight: r.targetWeight,
    stockValue,
    optionValue: l?.optionValue ?? null,
    realWeightPct: real,
    driftPct: real === null ? null : new Decimal(real).minus(r.targetWeight).toNumber(),
    sortOrder: r.sortOrder,
  };
});

process.stdout.write(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      asOf: today,
      totals: {
        positionsValueUsd: positionsValueSum.toNumber(),
        cashUsd: totalCashUsd.toNumber(),
        portfolioValueUsd: totalPortfolioValue.toNumber(),
        tickerTargetSum: tickerTargetSum.toNumber(),
        cashTargetWeight,
        grandTotal: grandTotal.toNumber(),
        balanced: grandTotal.minus(100).abs().lessThanOrEqualTo(0.01),
      },
      missingFromModel,
      unheldInModel,
      cashRows: cashRows.map((r) => ({
        id: r.id,
        name: r.name,
        cashAmountUsd: r.cashAmountUsd,
        realWeightPct: realWeight(r.cashAmountUsd),
        updatedAt: r.updatedAt,
      })),
      model,
    },
    null,
    2
  )
);
