/**
 * Data policy for the risk-engineering module.
 *
 * The proxy list is the set of tradeable ETFs the factor decomposition
 * regresses against (SPY and QQQ already arrive via BENCHMARK_TICKERS).
 * The history floor is how far back daily closes are kept so scenario
 * replay can reach Q4 2018 and COVID — well before the ledger's first
 * transaction. Both feed the price-refresh and backfill actions.
 */

export const RISK_PROXY_TICKERS = ["SOXX", "IGV", "TLT"] as const;

export const RISK_HISTORY_START = "2017-01-01";
