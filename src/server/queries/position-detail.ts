import { cache } from "react";
import Decimal from "decimal.js";
import { differenceInDays, parseISO, subDays } from "date-fns";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { mergePositionsByTicker, computeAggregates } from "@/server/services/computation";
import { getPriceHistory, getEarliestTransactionDate } from "@/server/queries/market-data";
import { getTransactions, type TransactionRow } from "@/server/queries/transactions";
import { getConcentrationData } from "@/server/queries/dashboard";
import { getTickerProfilesMap } from "@/server/queries/ticker-profiles";
import type { ComputedPosition, MarketDataInput } from "@/server/types/positions";

export interface PriceHistoryPoint {
  date: string;
  value: number;
}

export interface PositionTradeEvent {
  id: number;
  date: string;
  action: "buy" | "sell" | "dividend";
  qty: number | null;
  price: number | null;
  gross: number | null;
  portfolio: string;
  runningShares: number | null;
  runningAvgCost: number | null;
}

export interface PositionDetail {
  ticker: string;
  companyName: string | null;
  isEtf: boolean;
  isActive: boolean;
  hasInvalidState: boolean;
  currency: string;
  portfolio: string;

  position: ComputedPosition & { weight: number | null };

  heldSince: string | null;
  holdingYears: number | null;

  yieldOnCost: number | null;
  annualIncome: number | null;

  dayChange: { abs: number | null; pct: number | null };
  range52w: { low: number | null; high: number | null };
  sparkData: number[];

  priceHistory: PriceHistoryPoint[];

  trades: PositionTradeEvent[];

  concentration: { direct: number; etf: number; total: number };

  prevTicker: string | null;
  nextTicker: string | null;
  allTickers: string[];
}

function deriveDayChange(history: MarketDataInput[]): {
  abs: number | null;
  pct: number | null;
} {
  if (history.length < 2) return { abs: null, pct: null };
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (prev.value <= 0) return { abs: null, pct: null };
  const abs = new Decimal(last.value).minus(prev.value).toNumber();
  const pct = new Decimal(last.value).div(prev.value).minus(1).toNumber();
  return { abs, pct };
}

function deriveRange52w(
  history: MarketDataInput[],
  today: string,
): { low: number | null; high: number | null } {
  if (history.length === 0) return { low: null, high: null };
  const cutoff = subDays(parseISO(today), 365);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const window = history.filter((p) => p.date >= cutoffIso);
  const pool = window.length > 0 ? window : history;
  let low = pool[0].value;
  let high = pool[0].value;
  for (const p of pool) {
    if (p.value < low) low = p.value;
    if (p.value > high) high = p.value;
  }
  return { low, high };
}

function deriveSpark(history: MarketDataInput[], days = 30): number[] {
  if (history.length === 0) return [];
  return history.slice(-days).map((p) => p.value);
}

function deriveAnnualIncome(
  txs: TransactionRow[],
  today: string,
): number | null {
  if (txs.length === 0) return null;
  const cutoffIso = subDays(parseISO(today), 365).toISOString().slice(0, 10);
  let hadDividend = false;
  let total = new Decimal(0);
  for (const t of txs) {
    if (t.action !== "dividend") continue;
    if (t.date.value < cutoffIso) continue;
    hadDividend = true;
    if (t.grossAmount.value === null) continue;
    total = total.plus(t.grossAmount.value);
  }
  return hadDividend ? total.toNumber() : null;
}

/**
 * Walk transactions in date-ascending order to track per-event running shares
 * and running average cost. Buys add to basis at trade price; sells deplete
 * shares at the prevailing average cost (so the per-share avg stays stable
 * across partial exits — matches the position computation's weighted-average
 * basis model). Dividends pass through with no basis impact.
 */
function buildTradeEvents(txs: TransactionRow[]): PositionTradeEvent[] {
  const ascending = [...txs]
    .filter((t) => t.action === "buy" || t.action === "sell" || t.action === "dividend")
    .sort((a, b) => {
      if (a.date.value === b.date.value) return a.id - b.id;
      return a.date.value < b.date.value ? -1 : 1;
    });

  let shares = new Decimal(0);
  let cost = new Decimal(0);

  const out: PositionTradeEvent[] = ascending.map((t) => {
    const qty = t.quantity.value;
    const gross = t.grossAmount.value;
    const action = t.action as "buy" | "sell" | "dividend";

    if (action === "buy" && qty !== null && gross !== null) {
      shares = shares.plus(qty);
      cost = cost.plus(gross);
    } else if (action === "sell" && qty !== null) {
      const avg = shares.greaterThan(0) ? cost.div(shares) : new Decimal(0);
      cost = cost.minus(avg.times(qty));
      shares = shares.minus(qty);
      if (shares.lessThan(0)) shares = new Decimal(0);
      if (cost.lessThan(0)) cost = new Decimal(0);
    }

    const runningShares = shares.toNumber();
    const runningAvgCost = shares.greaterThan(0) ? cost.div(shares).toNumber() : null;
    const price =
      action !== "dividend" && qty !== null && qty > 0 && gross !== null
        ? new Decimal(gross).div(qty).toNumber()
        : null;

    return {
      id: t.id,
      date: t.date.value,
      action,
      qty: action === "dividend" ? null : qty,
      price,
      gross,
      portfolio: t.portfolio,
      runningShares: action === "dividend" ? null : runningShares,
      runningAvgCost: action === "dividend" ? null : runningAvgCost,
    };
  });

  // Render newest-first
  return out.reverse();
}

export const getPositionDetail = cache((ticker: string): PositionDetail | null => {
  const { txInputs, fxRates, today, positions: rawPositions } = fetchPositionInputs();

  // Merge across portfolios so a ticker spanning Taxable + Roth resolves to a
  // single position — matches the Positions page's "All portfolios" view.
  const merged = mergePositionsByTicker(rawPositions, txInputs, fxRates, today);
  const aggregates = computeAggregates(merged);

  // The detail page is stock-scoped: option positions on the same underlying
  // are surfaced on the Positions page only (their rows don't navigate here).
  const position = aggregates.positions.find(
    (p) => p.ticker === ticker && p.instrument === "stock"
  );
  if (!position) return null;

  const profilesMap = getTickerProfilesMap();
  const profile = profilesMap[ticker];

  // Build a stable navigation order: active positions by market value desc,
  // then closed positions by realized P&L desc — same priority the Positions
  // page sorts by, so prev/next mirrors the user's last view.
  const sorted = aggregates.positions
    .filter((p) => p.instrument === "stock")
    .sort((a, b) => {
    if (a.isClosed !== b.isClosed) return a.isClosed ? 1 : -1;
    if (a.isClosed) {
      const ar = a.realizedPnl ?? -Infinity;
      const br = b.realizedPnl ?? -Infinity;
      return br - ar;
    }
    const am = a.marketValue ?? -Infinity;
    const bm = b.marketValue ?? -Infinity;
    return bm - am;
  });
  const allTickers = sorted.map((p) => p.ticker);
  const idx = allTickers.indexOf(ticker);
  const prevTicker = idx > 0 ? allTickers[idx - 1] : allTickers[allTickers.length - 1] ?? null;
  const nextTicker =
    idx >= 0 && idx < allTickers.length - 1 ? allTickers[idx + 1] : allTickers[0] ?? null;

  // Per-ticker STOCK transactions for the trade-history table + held-since +
  // annual income — option rows would corrupt the running-shares trace.
  const txs = getTransactions(undefined, ticker).filter(
    (t) => t.instrument === "stock"
  );
  const trades = buildTradeEvents(txs);

  // Earliest BUY date is the canonical "held since"; falls back to first event
  // if somehow no buy is present (e.g. transferred-in legacy holding).
  const ascendingTxs = [...txs].sort((a, b) =>
    a.date.value < b.date.value ? -1 : a.date.value > b.date.value ? 1 : a.id - b.id,
  );
  const firstBuy = ascendingTxs.find((t) => t.action === "buy");
  const heldSince = firstBuy?.date.value ?? ascendingTxs[0]?.date.value ?? null;
  const holdingYears = heldSince
    ? differenceInDays(parseISO(today), parseISO(heldSince)) / 365.25
    : null;

  // Most recent transaction's portfolio surfaces in the breadcrumb. For
  // multi-portfolio holdings we render "All" — matches mergePositionsByTicker.
  const portfolios = new Set(txs.map((t) => t.portfolio));
  const portfolio = portfolios.size === 1 ? [...portfolios][0] : "All";

  // Price history starts from the earliest transaction across the ledger so
  // the chart spans the full holding life. Falls back to a 3-year window if
  // the ledger is empty (defensive — getPositionDetail is gated on a known
  // ticker, but the price-history table may exist without a transaction).
  const earliestTxDate = getEarliestTransactionDate();
  const fromDate =
    earliestTxDate ?? subDays(parseISO(today), 365 * 3).toISOString().slice(0, 10);
  const historyMap = getPriceHistory([ticker], "stock_price", fromDate);
  const history = historyMap[ticker] ?? [];

  const dayChange = deriveDayChange(history);
  const range52w = deriveRange52w(history, today);
  const sparkData = deriveSpark(history, 30);

  const yieldOnCost =
    position.totalDividends !== null && position.costBasis !== null && position.costBasis > 0
      ? position.totalDividends / position.costBasis
      : null;
  const annualIncome = deriveAnnualIncome(txs, today);

  // Concentration: dashboard's look-through holdings list already attributes
  // direct vs. via-ETF weight per ticker. We pull the row, fold sources into
  // two buckets, and surface the total — matches the dashboard's chart.
  const concentrationData = getConcentrationData();
  const holding = concentrationData.holdings.find((h) => h.ticker === ticker);
  let direct = 0;
  let etf = 0;
  if (holding) {
    for (const s of holding.sources) {
      if (s.type === "direct") direct += s.weight;
      else etf += s.weight;
    }
  }
  const concentration = { direct, etf, total: direct + etf };

  const priceHistory: PriceHistoryPoint[] = history.map((p) => ({
    date: p.date,
    value: p.value,
  }));

  return {
    ticker,
    companyName: profile?.name ?? null,
    isEtf: profile?.isEtf ?? false,
    isActive: !position.isClosed,
    hasInvalidState: position.hasInvalidState,
    currency: position.currency,
    portfolio,
    position,
    heldSince,
    holdingYears,
    yieldOnCost,
    annualIncome,
    dayChange,
    range52w,
    sparkData,
    priceHistory,
    trades,
    concentration,
    prevTicker,
    nextTicker,
    allTickers,
  };
});
