import { differenceInDays, parseISO } from "date-fns";
import type { TransactionInput } from "@/server/types/positions";

/**
 * Detects inter-broker relocations that masquerade as trading activity.
 *
 * When a position is moved between brokers, the ledger records it as a sell in
 * the origin portfolio and an offsetting buy in the destination portfolio at
 * (near-)identical price on the same or an adjacent day. Nothing about that is
 * an investment decision, but left unhandled it fabricates zero-skill
 * round-trips into win-rate and holding-period samples, inflates turnover, and
 * pollutes entry/exit-timing analysis.
 *
 * The cross-portfolio requirement is mandatory, not an optimisation: this
 * ledger contains genuine same-day sell-then-buy pairs *within* a single
 * portfolio (BABA 2021-12-31, NVDA 2025-08-01) that must never be flagged.
 */

export interface TransferPair {
  ticker: string;
  instrument: "stock" | "option";
  sellTxId: number;
  buyTxId: number;
  sellDate: string;
  buyDate: string;
  /** Absolute calendar-day distance between the two legs. */
  gapDays: number;
  sellPortfolio: string;
  buyPortfolio: string;
  qtyMatched: number;
  sellPrice: number;
  buyPrice: number;
  sellMatchedUsd: number;
  buyMatchedUsd: number;
  /** (buyPrice / sellPrice - 1) * 100 */
  priceDeltaPct: number;
  confidence: "high" | "medium" | "low";
}

export interface TransferDetectionResult {
  pairs: TransferPair[];
  /**
   * Transactions whose entire quantity was consumed by transfer matching.
   * These are the rows to drop from the decision universe.
   */
  legTxIds: Set<number>;
  /**
   * Matched quantity per transaction id, including partial matches. A row that
   * appears here but not in `legTxIds` was only partly a transfer; the residual
   * is a real trade and callers should keep it.
   */
  matchedQtyByTxId: Map<number, number>;
  totalSellUsd: number;
  totalBuyUsd: number;
}

export interface TransferDetectionOptions {
  /** Maximum absolute calendar-day gap between the two legs. */
  windowDays?: number;
  /** Maximum |buyPrice/sellPrice - 1| in percent. */
  priceTolerancePct?: number;
}

const QTY_EPSILON = 1e-6;

interface Leg {
  tx: TransactionInput;
  price: number;
  remaining: number;
}

function unitPrice(t: TransactionInput): number | null {
  if (t.quantity <= 0) return null;
  return t.grossAmount / t.quantity;
}

/**
 * Greedy matcher. For each sell (chronological, stable by id) it picks the
 * closest-dated eligible buy, breaking ties on smallest price divergence, and
 * consumes `min(remaining)` from both legs. Leftover quantity on either side
 * stays available — for a later match, or as a genuine trade.
 */
export function detectTransferPairs(
  transactions: TransactionInput[],
  options: TransferDetectionOptions = {}
): TransferDetectionResult {
  const windowDays = options.windowDays ?? 2;
  const priceTolerancePct = options.priceTolerancePct ?? 3;

  const sellsByKey = new Map<string, Leg[]>();
  const buysByKey = new Map<string, Leg[]>();

  for (const t of transactions) {
    if (t.action !== "buy" && t.action !== "sell") continue;
    const price = unitPrice(t);
    if (price === null || price <= 0) continue;
    const key = `${t.ticker}|${t.instrument}`;
    const leg: Leg = { tx: t, price, remaining: t.quantity };
    const bucket = t.action === "sell" ? sellsByKey : buysByKey;
    const list = bucket.get(key);
    if (list) list.push(leg);
    else bucket.set(key, [leg]);
  }

  const pairs: TransferPair[] = [];
  const matchedQtyByTxId = new Map<number, number>();
  let totalSellUsd = 0;
  let totalBuyUsd = 0;

  const byDateThenId = (a: Leg, b: Leg) =>
    a.tx.date.localeCompare(b.tx.date) || a.tx.id - b.tx.id;

  for (const [key, sells] of sellsByKey) {
    const buys = buysByKey.get(key);
    if (!buys || buys.length === 0) continue;

    sells.sort(byDateThenId);
    const sortedBuys = [...buys].sort(byDateThenId);

    for (const sell of sells) {
      while (sell.remaining > QTY_EPSILON) {
        let best: Leg | null = null;
        let bestGap = Number.POSITIVE_INFINITY;
        let bestDelta = Number.POSITIVE_INFINITY;

        for (const buy of sortedBuys) {
          if (buy.remaining <= QTY_EPSILON) continue;
          // Mandatory: a transfer moves shares BETWEEN portfolios. Same-portfolio
          // same-day sell+buy pairs in this ledger are genuine trades.
          if (buy.tx.portfolio === sell.tx.portfolio) continue;

          const gap = Math.abs(
            differenceInDays(parseISO(buy.tx.date), parseISO(sell.tx.date))
          );
          if (gap > windowDays) continue;

          const deltaPct = Math.abs((buy.price / sell.price - 1) * 100);
          if (deltaPct > priceTolerancePct) continue;

          if (gap < bestGap || (gap === bestGap && deltaPct < bestDelta)) {
            best = buy;
            bestGap = gap;
            bestDelta = deltaPct;
          }
        }

        if (best === null) break;

        const qty = Math.min(sell.remaining, best.remaining);
        sell.remaining -= qty;
        best.remaining -= qty;

        const sellMatchedUsd = qty * sell.price;
        const buyMatchedUsd = qty * best.price;
        totalSellUsd += sellMatchedUsd;
        totalBuyUsd += buyMatchedUsd;

        matchedQtyByTxId.set(
          sell.tx.id,
          (matchedQtyByTxId.get(sell.tx.id) ?? 0) + qty
        );
        matchedQtyByTxId.set(
          best.tx.id,
          (matchedQtyByTxId.get(best.tx.id) ?? 0) + qty
        );

        const signedDeltaPct = (best.price / sell.price - 1) * 100;
        pairs.push({
          ticker: sell.tx.ticker,
          instrument: sell.tx.instrument,
          sellTxId: sell.tx.id,
          buyTxId: best.tx.id,
          sellDate: sell.tx.date,
          buyDate: best.tx.date,
          gapDays: bestGap,
          sellPortfolio: sell.tx.portfolio,
          buyPortfolio: best.tx.portfolio,
          qtyMatched: qty,
          sellPrice: sell.price,
          buyPrice: best.price,
          sellMatchedUsd,
          buyMatchedUsd,
          priceDeltaPct: signedDeltaPct,
          confidence: classify(bestGap, Math.abs(signedDeltaPct)),
        });
      }
    }
  }

  pairs.sort(
    (a, b) => a.sellDate.localeCompare(b.sellDate) || a.ticker.localeCompare(b.ticker)
  );

  // Only rows consumed in full are safe to drop wholesale. A partially matched
  // row keeps a real residual and must stay in the decision universe.
  const qtyByTxId = new Map<number, number>();
  for (const t of transactions) qtyByTxId.set(t.id, t.quantity);
  const legTxIds = new Set<number>();
  for (const [txId, matched] of matchedQtyByTxId) {
    const total = qtyByTxId.get(txId);
    if (total !== undefined && matched >= total - QTY_EPSILON) legTxIds.add(txId);
  }

  return { pairs, legTxIds, matchedQtyByTxId, totalSellUsd, totalBuyUsd };
}

function classify(gapDays: number, absDeltaPct: number): TransferPair["confidence"] {
  if (gapDays === 0 && absDeltaPct < 1) return "high";
  if (gapDays <= 2 && absDeltaPct < 3) return "medium";
  return "low";
}
