/** Raw response from FMP /historical-price-eod/light endpoint */
export interface FmpEodQuote {
  symbol: string;
  date: string;
  price: number;
  volume: number;
}

/** Result returned by refresh Server Actions */
export interface RefreshResult {
  updated: number;
  skipped: number;
}
