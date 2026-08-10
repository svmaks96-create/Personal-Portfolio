/**
 * FMP fundamentals response shapes (subset of fields used) and the normalized
 * objects the refresh action persists into `ticker_fundamentals` /
 * `ticker_dividends`. All fetchers degrade to null/[] on missing data.
 */

/** Rich subset of FMP /profile — superset of FmpCompanyProfile's name/isEtf contract. */
export interface FmpProfileFull {
  symbol: string;
  companyName: string | null;
  isEtf: boolean;
  price: number | null;
  marketCap: number | null;
  beta: number | null;
  lastDividend: number | null;
  range52wLow: number | null;
  range52wHigh: number | null;
  exchange: string | null;
  exchangeFullName: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  ceo: string | null;
  employees: number | null;
  ipoDate: string | null;
  description: string | null;
  website: string | null;
  currency: string | null;
}

/** TTM ratios (FMP /ratios-ttm). Yields & margins are fractions; multiples are plain. */
export interface FmpRatiosTtm {
  peTtm: number | null;
  epsTtm: number | null;
  divYieldTtm: number | null;
  psTtm: number | null;
  pbTtm: number | null;
  pfcfTtm: number | null;
  evEbitdaTtm: number | null;
  netMarginTtm: number | null;
  debtToEquityTtm: number | null;
}

/**
 * Quality metrics from FMP /key-metrics-ttm. ROIC is capital-structure-
 * neutral (defined even with negative book equity); income quality is
 * CFO ÷ net income — the accruals signal.
 */
export interface FmpKeyMetricsTtm {
  roeTtm: number | null;
  roicTtm: number | null;
  incomeQualityTtm: number | null;
}

/** Forward EPS estimates (FMP /analyst-estimates). */
export interface FmpForwardEps {
  /** FY1 fiscal-year end (nearest upcoming), yyyy-MM-dd. */
  date: string;
  /** Raw FY1 estimate — the cross-run revision comparison basis. */
  epsAvg: number;
  /**
   * Time-weighted 12-month-forward EPS (FY1/FY2 interpolated so every name
   * is measured over the same horizon; FY1 alone when no FY2 estimate).
   */
  ntmEpsAvg: number;
}

/** FMP /price-target-consensus. */
export interface FmpPriceTargetConsensus {
  targetHigh: number | null;
  targetLow: number | null;
  targetMedian: number | null;
  targetConsensus: number | null;
}

/** FMP /ratings-snapshot. */
export interface FmpRatingSnapshot {
  rating: string | null;
  overallScore: number | null;
}

/** Single dividend event (FMP /dividends). `yield` is annualized PERCENT units. */
export interface FmpDividendEvent {
  exDate: string;
  paymentDate: string | null;
  dividend: number;
  yield: number | null;
  frequency: string | null;
}
