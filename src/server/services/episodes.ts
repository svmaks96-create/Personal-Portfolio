import Decimal from "decimal.js";
import { differenceInDays, parseISO } from "date-fns";
import { computeXIRR, lookupFxRate } from "@/server/services/computation";
import {
  buildMarkLookups,
  buildPriceLookups,
  forwardFillPriceDated,
  lastIndexAtOrBefore,
} from "@/server/services/price-lookup";
import type { TransactionInput } from "@/server/types/positions";
import {
  EPISODE_SHARE_EPSILON,
  FLAT_ADD_BAND_PCT,
  FLAT_OUTCOME_USD,
  MIN_DAYS_FOR_ANNUALIZED,
  type AddDirection,
  type BuildEpisodesOptions,
  type BuildEpisodesResult,
  type EpisodeAnomaly,
  type EpisodeTrade,
  type PositionEpisode,
} from "@/server/types/analytics";

/**
 * Cuts the transaction ledger into *position episodes*: contiguous spans where
 * net shares go 0 → positive → 0 (closed) or → present (open).
 *
 * Why episodes rather than positions: `computePositions` collapses a ticker's
 * entire history into one row, so a name bought, exited, and re-bought years
 * later reads as a single blended holding. Decision quality lives in the
 * individual round-trips, and there is no lot tracking to recover them from.
 *
 * The arithmetic deliberately mirrors `computePositions` line for line —
 * weighted-average cost, proportional basis release on sells, fee rows
 * capitalized, options carried at cost unless a mark postdates the last option
 * trade. Summing episode P&L per key must reproduce that function's `totalPnl`
 * exactly; that reconciliation is the engine's correctness gate.
 *
 * Two rules that are load-bearing:
 *
 * 1. Closure is evaluated **end-of-day**, never per transaction. A same-day
 *    sell-to-zero followed by a re-buy is one continuous episode, not two.
 *    Without this, a single ledger day fabricates dozens of fake round-trips.
 * 2. `pricePnlUsd` and `incomePnlUsd` are kept apart. The app's `realizedPnl`
 *    folds dividends into realized gains, which conflates trading skill with
 *    income — useless for behavior analysis.
 */
export function buildEpisodes(
  transactions: TransactionInput[],
  options: BuildEpisodesOptions
): BuildEpisodesResult {
  const {
    grain,
    endDate,
    priceHistory,
    optionMarkHistory = {},
    fxRates,
    transferLegTxIds,
    transferMatchedQtyByTxId,
    epsilon = EPISODE_SHARE_EPSILON,
    dividendGraceDays = 45,
    sleeveOf,
  } = options;

  const priceLookups = buildPriceLookups(priceHistory, transactions);
  const markLookups = buildMarkLookups(optionMarkHistory);

  const keyOf = (t: TransactionInput) =>
    grain === "consolidated"
      ? `${t.ticker}|${t.instrument}`
      : `${t.ticker}|${t.portfolio}|${t.instrument}`;

  // Buys, sells and fee rows drive the walk. Fee rows never move shares but do
  // capitalize into basis, exactly as computePositions treats them.
  const walkGroups = new Map<string, TransactionInput[]>();
  const dividendGroups = new Map<string, TransactionInput[]>();

  for (const t of transactions) {
    if (t.action === "dividend") {
      const k = keyOf(t);
      push(dividendGroups, k, t);
    } else {
      push(walkGroups, keyOf(t), t);
    }
  }

  const episodes: PositionEpisode[] = [];
  const anomalies: EpisodeAnomaly[] = [];

  for (const [key, group] of walkGroups) {
    group.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);

    const built = walkKey(key, group, {
      grain,
      endDate,
      priceLookups,
      markLookups,
      fxRates,
      transferLegTxIds,
      transferMatchedQtyByTxId,
      epsilon,
      sleeveOf,
      anomalies,
    });

    const dividendKey =
      grain === "consolidated"
        ? `${group[0].ticker}|stock`
        : `${group[0].ticker}|${group[0].portfolio}|stock`;
    attachDividends(
      built,
      dividendGroups.get(dividendKey) ?? [],
      fxRates,
      dividendGraceDays,
      key,
      anomalies,
      // Only the stock walk consumes dividends; option keys must not absorb them.
      group[0].instrument === "stock"
    );

    for (const ep of built) finalize(ep, epsilon);
    episodes.push(...built);
  }

  episodes.sort(
    (a, b) => a.openDate.localeCompare(b.openDate) || a.ticker.localeCompare(b.ticker)
  );

  return { episodes, anomalies };
}

function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

interface WalkContext {
  grain: BuildEpisodesOptions["grain"];
  endDate: string;
  priceLookups: Map<string, import("@/server/types/positions").MarketDataInput[]>;
  markLookups: Map<string, import("@/server/types/positions").MarketDataInput[]>;
  fxRates: BuildEpisodesOptions["fxRates"];
  transferLegTxIds: ReadonlySet<number> | undefined;
  transferMatchedQtyByTxId: ReadonlyMap<number, number> | undefined;
  epsilon: number;
  sleeveOf: BuildEpisodesOptions["sleeveOf"];
  anomalies: EpisodeAnomaly[];
}

/** Mutable accumulator; converted to a `PositionEpisode` by `finalize`. */
interface Draft extends PositionEpisode {
  _invested: Decimal;
  _proceeds: Decimal;
  _fees: Decimal;
  _lastOptionTxDate: string;
  _portfolios: Set<string>;
  _flows: { date: string; amount: number }[];
}

function walkKey(key: string, group: TransactionInput[], ctx: WalkContext): Draft[] {
  const first = group[0];
  const isOption = first.instrument === "option";
  const out: Draft[] = [];

  let shares = new Decimal(0);
  let costBasis = new Decimal(0);
  let current: Draft | null = null;
  let episodeIndex = 0;

  for (const dayTxns of chunkByDate(group)) {
    for (const t of dayTxns) {
      const fx = lookupFxRate(t.currency, t.date, ctx.fxRates);
      if (fx === null) {
        ctx.anomalies.push({
          kind: "missing-fx",
          key,
          ticker: t.ticker,
          date: t.date,
          detail: `No ${t.currency}USD rate at or before ${t.date}; row skipped.`,
          amountUsd: null,
          quantity: t.quantity,
        });
        continue;
      }
      const rate = new Decimal(fx);
      const gross = new Decimal(t.grossAmount);
      const fees = new Decimal(t.fees);
      const qty = new Decimal(t.quantity);

      if (t.action === "fee") {
        // Mirrors computePositions: fee rows read the `fees` column, not
        // `grossAmount`. Every fee row in this ledger has fees = 0, so this is
        // numerically a no-op — but it must stay to keep reconciliation exact.
        const feeUsd = fees.times(rate);
        if (current === null) {
          ctx.anomalies.push({
            kind: "fee-outside-episode",
            key,
            ticker: t.ticker,
            date: t.date,
            detail: "Fee row with no open episode; capitalized nowhere.",
            amountUsd: feeUsd.toNumber(),
            quantity: null,
          });
          continue;
        }
        costBasis = costBasis.plus(feeUsd);
        current._invested = current._invested.plus(feeUsd);
        current._fees = current._fees.plus(feeUsd);
        continue;
      }

      // Dividends are routed to their own map and attached after the walk.
      if (t.action !== "buy" && t.action !== "sell") continue;

      if (current === null) {
        if (t.action === "sell") {
          ctx.anomalies.push({
            kind: "orphan-sell",
            key,
            ticker: t.ticker,
            date: t.date,
            detail: "Sell with no open position; row ignored.",
            amountUsd: gross.minus(fees).times(rate).toNumber(),
            quantity: t.quantity,
          });
          continue;
        }
        episodeIndex += 1;
        current = newDraft(key, t, ctx, episodeIndex, isOption);
        // Registered on open so the trailing still-open episode needs no
        // post-loop branch; closure below only mutates it.
        out.push(current);
        shares = new Decimal(0);
        costBasis = new Decimal(0);
      }

      const avgBefore = shares.greaterThan(ctx.epsilon)
        ? costBasis.div(shares)
        : null;
      const fillPrice = t.quantity > 0 ? t.grossAmount / t.quantity : 0;

      let vsAvgCostPct: number | null = null;
      let addDirection: AddDirection | null = null;
      let netCashUsd: number;

      if (t.action === "buy") {
        const cost = gross.plus(fees).times(rate);
        if (avgBefore === null) {
          addDirection = "initial";
        } else {
          const pct = (fillPrice / avgBefore.toNumber() - 1) * 100;
          vsAvgCostPct = pct;
          addDirection =
            Math.abs(pct) <= FLAT_ADD_BAND_PCT ? "flat" : pct > 0 ? "up" : "down";
        }
        shares = shares.plus(qty);
        costBasis = costBasis.plus(cost);
        current._invested = current._invested.plus(cost);
        netCashUsd = cost.neg().toNumber();
      } else {
        if (shares.greaterThan(ctx.epsilon)) {
          costBasis = costBasis.minus(qty.div(shares).times(costBasis));
        }
        shares = shares.minus(qty);
        const proceeds = gross.minus(fees).times(rate);
        current._proceeds = current._proceeds.plus(proceeds);
        netCashUsd = proceeds.toNumber();
        if (shares.lessThan(-ctx.epsilon)) {
          current.dataQuality.residualShares = shares.toNumber();
          ctx.anomalies.push({
            kind: "oversell",
            key,
            ticker: t.ticker,
            date: t.date,
            detail: `Sell drove net shares to ${shares.toNumber()}.`,
            amountUsd: null,
            quantity: t.quantity,
          });
        }
      }

      current._fees = current._fees.plus(fees.times(rate));
      current._portfolios.add(t.portfolio);
      current._flows.push({ date: t.date, amount: netCashUsd });
      if (isOption) current._lastOptionTxDate = t.date;
      if (shares.greaterThan(current.maxSharesHeld)) {
        current.maxSharesHeld = shares.toNumber();
      }

      const matchedQty = ctx.transferMatchedQtyByTxId?.get(t.id) ?? 0;
      const leg: EpisodeTrade = {
        txId: t.id,
        date: t.date,
        action: t.action,
        portfolio: t.portfolio,
        quantity: t.quantity,
        grossUsd: gross.times(rate).toNumber(),
        feesUsd: fees.times(rate).toNumber(),
        pricePerShare: fillPrice,
        netCashUsd,
        legIndex: current.trades.length,
        isOpeningTrade: current.trades.length === 0,
        isTransferLeg: ctx.transferLegTxIds?.has(t.id) ?? false,
        transferMatchedQty: matchedQty,
        runningSharesAfter: shares.toNumber(),
        runningAvgCostAfter: shares.greaterThan(ctx.epsilon)
          ? costBasis.div(shares).toNumber()
          : null,
        vsAvgCostPct,
        addDirection,
      };
      if (matchedQty > 0) current.dataQuality.containsTransferLegs = true;
      current.trades.push(leg);
    }

    // End-of-day closure. Intraday round-trips do not split an episode.
    if (current !== null && shares.abs().lessThanOrEqualTo(ctx.epsilon)) {
      current.closeDate = dayTxns[dayTxns.length - 1].date;
      current.isOpen = false;
      current.sharesRemaining = shares.toNumber();
      current.dataQuality.residualShares = shares.toNumber();
      current.costBasisRemainingUsd = 0;
      current.marketValueUsd = 0;
      current = null;
      shares = new Decimal(0);
      costBasis = new Decimal(0);
    }
  }

  // Anything still flagged open never hit an end-of-day flat, so it runs to
  // the valuation date.
  for (const draft of out) {
    if (!draft.isOpen) continue;
    draft.closeDate = null;
    draft.sharesRemaining = shares.toNumber();
    draft.costBasisRemainingUsd = costBasis.toNumber();
    valueOpenEpisode(draft, shares, costBasis, first, ctx, isOption);
  }

  return out;
}

function newDraft(
  key: string,
  t: TransactionInput,
  ctx: WalkContext,
  episodeIndex: number,
  isOption: boolean
): Draft {
  return {
    key,
    grain: ctx.grain,
    ticker: t.ticker,
    instrument: t.instrument,
    portfolios: [],
    sleeve: ctx.sleeveOf ? ctx.sleeveOf(t.ticker, t.instrument) : null,
    episodeIndex,
    openDate: t.date,
    closeDate: null,
    asOfDate: ctx.endDate,
    holdingDays: 0,
    isOpen: true,
    trades: [],
    buyCount: 0,
    sellCount: 0,
    addCount: 0,
    trimCount: 0,
    addsAboveAvgCost: 0,
    addsBelowAvgCost: 0,
    addUpUsd: 0,
    addDownUsd: 0,
    maxSharesHeld: 0,
    sharesRemaining: 0,
    totalInvestedUsd: 0,
    totalProceedsUsd: 0,
    feesUsd: 0,
    dividendsUsd: 0,
    costBasisRemainingUsd: 0,
    marketValueUsd: null,
    lastPriceDate: null,
    pricePnlUsd: null,
    incomePnlUsd: 0,
    totalPnlUsd: null,
    priceReturnPct: null,
    totalReturnPct: null,
    irrPct: null,
    annualizedReturnPct: null,
    outcome: "unknown",
    dataQuality: {
      missingPrice: false,
      stalePriceDays: null,
      optionCarriedAtCost: false,
      containsTransferLegs: false,
      residualShares: 0,
      dividendsAfterCloseUsd: 0,
    },
    _invested: new Decimal(0),
    _proceeds: new Decimal(0),
    _fees: new Decimal(0),
    _lastOptionTxDate: isOption ? t.date : "",
    _portfolios: new Set<string>(),
    _flows: [],
  };
}

/**
 * Values a still-open episode at `endDate`, mirroring `computePositions`:
 * stocks at the last quote at-or-before the date, options at their latest mark
 * only when that mark postdates the last option trade (a trade invalidates the
 * previous total-value mark), otherwise at cost.
 */
function valueOpenEpisode(
  draft: Draft,
  shares: Decimal,
  costBasis: Decimal,
  first: TransactionInput,
  ctx: WalkContext,
  isOption: boolean
): void {
  if (isOption) {
    const marks = ctx.markLookups.get(first.ticker);
    let value = costBasis;
    let carriedAtCost = true;
    if (marks) {
      const idx = lastIndexAtOrBefore(marks, ctx.endDate);
      if (idx !== -1 && marks[idx].date >= draft._lastOptionTxDate) {
        value = new Decimal(marks[idx].value);
        carriedAtCost = false;
        draft.lastPriceDate = marks[idx].date;
      }
    }
    draft.dataQuality.optionCarriedAtCost = carriedAtCost;
    draft.marketValueUsd = value.toNumber();
    return;
  }

  const prices = ctx.priceLookups.get(first.ticker);
  const quote = prices ? forwardFillPriceDated(prices, ctx.endDate) : null;
  if (quote === null) {
    draft.dataQuality.missingPrice = true;
    draft.marketValueUsd = null;
    return;
  }

  const fx = lookupFxRate(first.currency, quote.date, ctx.fxRates);
  if (fx === null) {
    draft.dataQuality.missingPrice = true;
    draft.marketValueUsd = null;
    return;
  }

  draft.lastPriceDate = quote.date;
  draft.dataQuality.stalePriceDays = differenceInDays(
    parseISO(ctx.endDate),
    parseISO(quote.date)
  );
  draft.marketValueUsd = shares.times(quote.value).times(fx).toNumber();
}

/**
 * Assigns every dividend row to the episode with the latest `openDate` at or
 * before the payment date. Rows landing after that episode closed are still
 * attributed there (they are trailing payments on shares already sold) but are
 * counted separately so the reader can see them.
 */
function attachDividends(
  episodes: Draft[],
  dividends: TransactionInput[],
  fxRates: BuildEpisodesOptions["fxRates"],
  graceDays: number,
  key: string,
  anomalies: EpisodeAnomaly[],
  consume: boolean
): void {
  if (!consume || episodes.length === 0 || dividends.length === 0) return;

  const ordered = [...episodes].sort((a, b) => a.openDate.localeCompare(b.openDate));

  for (const d of dividends) {
    const fx = lookupFxRate(d.currency, d.date, fxRates);
    if (fx === null) continue;
    const amount = new Decimal(d.grossAmount).times(fx).toNumber();

    let target: Draft | null = null;
    for (const ep of ordered) {
      if (ep.openDate <= d.date) target = ep;
      else break;
    }

    if (target === null) {
      anomalies.push({
        kind: "dividend-before-open",
        key,
        ticker: d.ticker,
        date: d.date,
        detail: "Dividend predates every episode for this key.",
        amountUsd: amount,
        quantity: null,
      });
      continue;
    }

    target.dividendsUsd += amount;
    target._flows.push({ date: d.date, amount });

    if (target.closeDate !== null && d.date > target.closeDate) {
      target.dataQuality.dividendsAfterCloseUsd += amount;
      const gap = differenceInDays(parseISO(d.date), parseISO(target.closeDate));
      if (gap > graceDays) {
        anomalies.push({
          kind: "dividend-after-close",
          key,
          ticker: d.ticker,
          date: d.date,
          detail: `Paid ${gap} days after the episode closed on ${target.closeDate}.`,
          amountUsd: amount,
          quantity: null,
        });
      }
    }
  }
}

function finalize(draft: Draft, epsilon: number): void {
  const ep = draft as PositionEpisode;

  ep.portfolios = [...draft._portfolios].sort();
  ep.totalInvestedUsd = draft._invested.toNumber();
  ep.totalProceedsUsd = draft._proceeds.toNumber();
  ep.feesUsd = draft._fees.toNumber();

  ep.buyCount = draft.trades.filter((t) => t.action === "buy").length;
  ep.sellCount = draft.trades.filter((t) => t.action === "sell").length;
  ep.addCount = Math.max(0, ep.buyCount - 1);
  ep.trimCount = draft.isOpen ? ep.sellCount : Math.max(0, ep.sellCount - 1);

  for (const t of draft.trades) {
    if (t.action !== "buy" || t.addDirection === null) continue;
    if (t.addDirection === "up") {
      ep.addsAboveAvgCost += 1;
      ep.addUpUsd += Math.abs(t.netCashUsd);
    } else if (t.addDirection === "down") {
      ep.addsBelowAvgCost += 1;
      ep.addDownUsd += Math.abs(t.netCashUsd);
    }
  }

  const endForDays = ep.closeDate ?? ep.asOfDate;
  ep.holdingDays = Math.max(
    0,
    differenceInDays(parseISO(endForDays), parseISO(ep.openDate))
  );

  ep.incomePnlUsd = ep.dividendsUsd;

  if (ep.marketValueUsd === null) {
    ep.pricePnlUsd = null;
    ep.totalPnlUsd = null;
    ep.priceReturnPct = null;
    ep.totalReturnPct = null;
    ep.outcome = "unknown";
  } else {
    const price = new Decimal(ep.totalProceedsUsd)
      .plus(ep.marketValueUsd)
      .minus(ep.totalInvestedUsd);
    ep.pricePnlUsd = price.toNumber();
    ep.totalPnlUsd = price.plus(ep.incomePnlUsd).toNumber();

    if (ep.totalInvestedUsd > epsilon) {
      ep.priceReturnPct = (ep.pricePnlUsd / ep.totalInvestedUsd) * 100;
      ep.totalReturnPct = (ep.totalPnlUsd / ep.totalInvestedUsd) * 100;
    }

    ep.outcome =
      Math.abs(ep.totalPnlUsd) <= FLAT_OUTCOME_USD
        ? "flat"
        : ep.totalPnlUsd > 0
          ? "win"
          : "loss";
  }

  const flows = [...draft._flows];
  if (ep.isOpen && ep.marketValueUsd !== null) {
    flows.push({ date: ep.asOfDate, amount: ep.marketValueUsd });
  }
  ep.irrPct = computeXIRR(flows);

  if (
    ep.holdingDays >= MIN_DAYS_FOR_ANNUALIZED &&
    ep.totalReturnPct !== null &&
    ep.totalInvestedUsd > epsilon
  ) {
    const growth = 1 + ep.totalReturnPct / 100;
    if (growth > 0) {
      const years = ep.holdingDays / 365.25;
      ep.annualizedReturnPct = (Math.pow(growth, 1 / years) - 1) * 100;
    }
  }

  const mutable = draft as Partial<Draft>;
  delete mutable._invested;
  delete mutable._proceeds;
  delete mutable._fees;
  delete mutable._lastOptionTxDate;
  delete mutable._portfolios;
  delete mutable._flows;
}

function chunkByDate(sorted: TransactionInput[]): TransactionInput[][] {
  const out: TransactionInput[][] = [];
  let bucket: TransactionInput[] = [];
  for (const t of sorted) {
    if (bucket.length > 0 && bucket[0].date !== t.date) {
      out.push(bucket);
      bucket = [];
    }
    bucket.push(t);
  }
  if (bucket.length > 0) out.push(bucket);
  return out;
}
