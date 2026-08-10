/** One company row from FMP /company-screener (shape verified live 2026-08-04). */
export interface FmpScreenerCompany {
  symbol: string;
  companyName: string | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  price: number | null;
  /** FMP reports latest daily volume here — used as the avg-volume proxy. */
  volume: number | null;
  exchangeShortName: string | null;
}

/** Percent price moves from FMP /stock-price-change (keys "1M"/"3M"/"6M"/"1Y"). */
export interface FmpPriceChange {
  change1m: number | null;
  change3m: number | null;
  change6m: number | null;
  change1y: number | null;
}
