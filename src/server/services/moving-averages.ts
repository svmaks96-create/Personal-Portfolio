/**
 * Simple-moving-average context over sorted market_data price rows.
 *
 * Pure. Plain `number` arithmetic is deliberate here — these are technical
 * statistics feeding percentile ranks, not money math (documented exception
 * to the decimal.js rule; see quant-score.ts).
 */

export interface PricePoint {
  /** yyyy-MM-dd */
  date: string;
  value: number;
}

export interface DmaContext {
  lastPrice: number | null;
  sma50: number | null;
  sma200: number | null;
  /** (last − sma) / sma × 100; null when either side is missing. */
  distanceTo50Pct: number | null;
  distanceTo200Pct: number | null;
}

const EMPTY: DmaContext = {
  lastPrice: null,
  sma50: null,
  sma200: null,
  distanceTo50Pct: null,
  distanceTo200Pct: null,
};

function smaOfLast(values: number[], window: number): number | null {
  if (values.length < window) return null;
  let sum = 0;
  for (let i = values.length - window; i < values.length; i++) {
    sum += values[i];
  }
  return sum / window;
}

/**
 * Compute 50/200-DMA and the last price's distance to each. `prices` must be
 * ascending by date (market_data query order); rows after `asOfDate` (when
 * given) are ignored. Windows without enough history return null — never a
 * shorter-window average in disguise.
 */
export function computeDmaContext(
  prices: PricePoint[],
  asOfDate?: string,
): DmaContext {
  const usable =
    asOfDate === undefined ? prices : prices.filter((p) => p.date <= asOfDate);
  if (usable.length === 0) return EMPTY;

  const values = usable.map((p) => p.value);
  const lastPrice = values[values.length - 1];
  const sma50 = smaOfLast(values, 50);
  const sma200 = smaOfLast(values, 200);

  const distance = (sma: number | null): number | null =>
    sma === null || sma === 0 ? null : ((lastPrice - sma) / sma) * 100;

  return {
    lastPrice,
    sma50,
    sma200,
    distanceTo50Pct: distance(sma50),
    distanceTo200Pct: distance(sma200),
  };
}
