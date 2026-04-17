/** Subset of FMP company profile response used for ticker metadata */
export interface FmpCompanyProfile {
  symbol: string;
  companyName: string | null;
  isEtf: boolean;
}

/** Raw response from FMP /etf-holdings endpoint */
export interface FmpEtfHolding {
  symbol: string;
  asset: string;
  weightPercentage: number;
  name: string;
}

/** Raw response item from FMP /search-exchange-variants endpoint */
export interface FmpExchangeVariant {
  symbol: string;
}

/** Tracks how a ticker's weight is attributed (direct holding vs ETF exposure) */
export interface ConcentrationSource {
  type: "direct" | "etf";
  etfTicker?: string;
  weight: number;
}

/** A single row in the concentration chart */
export interface ConcentrationHolding {
  ticker: string;
  weight: { value: number; display: string };
  sources: ConcentrationSource[];
}

/** Full concentration data for the chart */
export interface ConcentrationData {
  holdings: ConcentrationHolding[];
  etfTickers: string[];
}
