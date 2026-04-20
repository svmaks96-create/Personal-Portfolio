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

/** Result returned by the one-time price-history backfill Server Action */
export interface BackfillResult {
  /** Total number of symbols attempted (held tickers + benchmarks + FX pairs). */
  symbolsAttempted: number;
  /** Symbols that returned at least one row. */
  symbolsSucceeded: number;
  /** Symbols that returned zero rows from FMP. */
  symbolsFailed: string[];
  /** Total daily rows written across all symbols. */
  rowsWritten: number;
  /** Earliest transaction date used as the `from` parameter. */
  earliestDate: string;
}
