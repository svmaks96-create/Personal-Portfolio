import type { MarketDataInput, FxRateInput } from "@/server/types/positions";

/**
 * Grain at which position episodes are cut.
 *
 * `consolidated` keys by (ticker, instrument) and is the headline grain: it
 * makes an inter-broker relocation invisible for any name that stayed net-long
 * across the move, so those names are not falsely counted as round-trips.
 *
 * `account` keys by (ticker, portfolio, instrument), matching the grouping in
 * `computePositions`. It exists so episode P&L can be reconciled 1:1 against
 * the app's own numbers — that reconciliation is the correctness gate.
 */
export type EpisodeGrain = "consolidated" | "account";

/**
 * Net-share residual below which a position counts as flat. The largest float
 * residual observed in this ledger is ~1.1e-13; the smallest fractional share
 * traded is ~1e-4. 1e-6 sits safely between the two.
 */
export const EPISODE_SHARE_EPSILON = 1e-6;

/** Buys within this band of running average cost count as neither up nor down. */
export const FLAT_ADD_BAND_PCT = 0.5;

/** Below this holding length an annualized return is noise, so it is suppressed. */
export const MIN_DAYS_FOR_ANNUALIZED = 30;

/** |total P&L| at or below this counts as a scratch rather than a win or loss. */
export const FLAT_OUTCOME_USD = 1;

export type AddDirection = "initial" | "up" | "down" | "flat";

export interface EpisodeTrade {
  txId: number;
  date: string;
  action: "buy" | "sell";
  portfolio: string;
  quantity: number;
  grossUsd: number;
  feesUsd: number;
  /** grossAmount / quantity in native currency — the actual fill, not the close. */
  pricePerShare: number;
  /** buy: -(gross + fees) · fx | sell: +(gross - fees) · fx */
  netCashUsd: number;
  /** 0-based position of this trade within its episode. */
  legIndex: number;
  isOpeningTrade: boolean;
  /** True when this leg was matched as an inter-broker transfer. */
  isTransferLeg: boolean;
  /** Quantity of this leg matched as a transfer (may be partial). */
  transferMatchedQty: number;
  runningSharesAfter: number;
  runningAvgCostAfter: number | null;
  /** (fill price / running avg cost BEFORE this trade - 1) · 100. Buys only. */
  vsAvgCostPct: number | null;
  addDirection: AddDirection | null;
}

export interface EpisodeDataQuality {
  missingPrice: boolean;
  /** Days between the quote actually used and the valuation date. */
  stalePriceDays: number | null;
  optionCarriedAtCost: boolean;
  containsTransferLegs: boolean;
  residualShares: number;
  dividendsAfterCloseUsd: number;
}

export interface PositionEpisode {
  key: string;
  grain: EpisodeGrain;
  ticker: string;
  instrument: "stock" | "option";
  portfolios: string[];
  sleeve: string | null;
  /** 1-based ordinal of this episode within its key. */
  episodeIndex: number;

  openDate: string;
  closeDate: string | null;
  asOfDate: string;
  holdingDays: number;
  isOpen: boolean;

  trades: EpisodeTrade[];
  buyCount: number;
  sellCount: number;
  /** Buys after the opening trade. */
  addCount: number;
  /** Sells that did not close the episode. */
  trimCount: number;
  addsAboveAvgCost: number;
  addsBelowAvgCost: number;
  addUpUsd: number;
  addDownUsd: number;
  maxSharesHeld: number;
  sharesRemaining: number;

  totalInvestedUsd: number;
  totalProceedsUsd: number;
  feesUsd: number;
  dividendsUsd: number;
  costBasisRemainingUsd: number;
  marketValueUsd: number | null;
  lastPriceDate: string | null;

  /** proceeds + terminal MV - invested. Excludes income. */
  pricePnlUsd: number | null;
  incomePnlUsd: number;
  totalPnlUsd: number | null;

  priceReturnPct: number | null;
  totalReturnPct: number | null;
  irrPct: number | null;
  annualizedReturnPct: number | null;

  outcome: "win" | "loss" | "flat" | "unknown";
  dataQuality: EpisodeDataQuality;
}

export type EpisodeAnomalyKind =
  | "orphan-sell"
  | "oversell"
  | "dividend-before-open"
  | "dividend-after-close"
  | "fee-outside-episode"
  | "missing-fx"
  | "residual-dust";

export interface EpisodeAnomaly {
  kind: EpisodeAnomalyKind;
  key: string;
  ticker: string;
  date: string;
  detail: string;
  amountUsd: number | null;
  quantity: number | null;
}

export interface BuildEpisodesOptions {
  grain: EpisodeGrain;
  /** Valuation date for open episodes. Prices/marks are read at-or-before this. */
  endDate: string;
  priceHistory: Record<string, MarketDataInput[]>;
  optionMarkHistory?: Record<string, MarketDataInput[]>;
  fxRates: FxRateInput[];
  /** Fully-consumed transfer legs, from `detectTransferPairs`. */
  transferLegTxIds?: ReadonlySet<number>;
  /** Partial transfer match quantities, from `detectTransferPairs`. */
  transferMatchedQtyByTxId?: ReadonlyMap<number, number>;
  epsilon?: number;
  /** Days after a close within which a trailing dividend is expected, not flagged. */
  dividendGraceDays?: number;
  sleeveOf?: (ticker: string, instrument: "stock" | "option") => string;
}

export interface BuildEpisodesResult {
  episodes: PositionEpisode[];
  anomalies: EpisodeAnomaly[];
}
