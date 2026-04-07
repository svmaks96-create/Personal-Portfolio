/** Raw response from FMP /quote-short endpoint */
export interface FmpQuote {
  symbol: string;
  price: number;
  volume: number;
}

/** Raw response from FMP /forex-quote-short endpoint */
export interface FmpFxQuote {
  symbol: string;
  price: number;
  volume: number;
}

/** Result returned by refresh Server Actions */
export interface RefreshResult {
  updated: number;
  skipped: number;
}
