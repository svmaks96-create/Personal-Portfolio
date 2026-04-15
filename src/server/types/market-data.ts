/** Raw response from FMP /quote endpoint */
export interface FmpQuote {
  symbol: string;
  name?: string;
  price: number;
  volume: number;
  timestamp: number;
}

/** Raw response from FMP /quote endpoint (forex pair) */
export interface FmpFxQuote {
  symbol: string;
  price: number;
  volume: number;
  timestamp: number;
}

/** Result returned by refresh Server Actions */
export interface RefreshResult {
  updated: number;
  skipped: number;
}
