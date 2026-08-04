import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(),
    ticker: text("ticker").notNull(),
    action: text("action").$type<"buy" | "sell" | "dividend" | "fee">().notNull(),
    instrument: text("instrument").$type<"stock" | "option">().notNull().default("stock"),
    quantity: real("quantity").notNull(),
    grossAmount: real("gross_amount").notNull(),
    fees: real("fees").notNull().default(0),
    portfolio: text("portfolio").notNull(),
    currency: text("currency").notNull(),
  },
  (table) => [
    index("transactions_ticker_portfolio_idx").on(table.ticker, table.portfolio),
    index("transactions_date_idx").on(table.date),
  ]
);

export const marketData = sqliteTable(
  "market_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    symbol: text("symbol").notNull(),
    type: text("type").$type<"stock_price" | "fx_rate" | "option_mark">().notNull(),
    date: text("date").notNull(),
    value: real("value").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("market_data_symbol_type_date_idx").on(table.symbol, table.type, table.date),
  ]
);

export const tickerProfiles = sqliteTable(
  "ticker_profiles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    name: text("name"),
    isEtf: integer("is_etf", { mode: "boolean" }).notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [uniqueIndex("ticker_profiles_ticker_idx").on(table.ticker)]
);

export const etfHoldings = sqliteTable(
  "etf_holdings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    etfSymbol: text("etf_symbol").notNull(),
    asset: text("asset").notNull(),
    weightPercentage: real("weight_percentage").notNull(),
    name: text("name"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("etf_holdings_etf_symbol_idx").on(table.etfSymbol),
  ]
);

export const tickerVariants = sqliteTable(
  "ticker_variants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    variant: text("variant").notNull(),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [
    index("ticker_variants_ticker_idx").on(table.ticker),
    uniqueIndex("ticker_variants_variant_idx").on(table.variant),
  ]
);

export const allocationTargets = sqliteTable(
  "allocation_targets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind").$type<"ticker" | "cash">().notNull(),
    name: text("name").notNull(),
    // NULL on cash rows and on ticker rows not yet assigned to a policy bucket.
    bucket: text("bucket").$type<"core" | "active">(),
    targetWeight: real("target_weight").notNull(),
    cashAmountUsd: real("cash_amount_usd"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("allocation_targets_kind_name_idx").on(table.kind, table.name),
  ]
);

export const tickerFundamentals = sqliteTable(
  "ticker_fundamentals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    // Company profile (from FMP /profile)
    exchange: text("exchange"),
    exchangeFullName: text("exchange_full_name"),
    sector: text("sector"),
    industry: text("industry"),
    country: text("country"),
    ceo: text("ceo"),
    employees: integer("employees"),
    ipoDate: text("ipo_date"),
    description: text("description"),
    website: text("website"),
    currency: text("currency"),
    // Profile-time price snapshot — stored so derived figures (fwdPe) stay
    // self-consistent with the multiples computed against the same price.
    price: real("price"),
    marketCap: real("market_cap"),
    beta: real("beta"),
    range52wLow: real("range_52w_low"),
    range52wHigh: real("range_52w_high"),
    lastDividend: real("last_dividend"),
    // Valuation (TTM ratios / key metrics). Yields & margins are fractions
    // (e.g. 0.0035 = 0.35%); multiples are plain numbers (e.g. 35.9).
    peTtm: real("pe_ttm"),
    epsTtm: real("eps_ttm"),
    fwdPe: real("fwd_pe"),
    divYieldTtm: real("div_yield_ttm"),
    psTtm: real("ps_ttm"),
    pbTtm: real("pb_ttm"),
    pfcfTtm: real("pfcf_ttm"),
    evEbitdaTtm: real("ev_ebitda_ttm"),
    netMarginTtm: real("net_margin_ttm"),
    roeTtm: real("roe_ttm"),
    debtToEquityTtm: real("debt_to_equity_ttm"),
    // Analyst coverage
    priceTargetHigh: real("price_target_high"),
    priceTargetLow: real("price_target_low"),
    priceTargetMedian: real("price_target_median"),
    priceTargetConsensus: real("price_target_consensus"),
    analystRating: text("analyst_rating"),
    analystScore: integer("analyst_score"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [uniqueIndex("ticker_fundamentals_ticker_idx").on(table.ticker)]
);

export const tickerDividends = sqliteTable(
  "ticker_dividends",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    exDate: text("ex_date").notNull(),
    paymentDate: text("payment_date"),
    dividend: real("dividend").notNull(),
    // Annualized yield in PERCENT units at the time (e.g. 0.36 = 0.36%).
    yield: real("yield"),
    frequency: text("frequency"),
    fetchedAt: text("fetched_at").notNull(),
  },
  (table) => [index("ticker_dividends_ticker_idx").on(table.ticker)]
);

/**
 * Append-only thesis ledger — every underwriting produces a new version row.
 * Invariants live in the actions layer (SQLite partial unique indexes are
 * unreliable via db:push): per ticker at most one `draft` and one
 * `is_current=1` final. Core ETF rows carry no levels, break conditions, or
 * horizon (policy: no opinions in the Engine).
 */
export const positionTheses = sqliteTable(
  "position_theses",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    ticker: text("ticker").notNull(),
    bucket: text("bucket").$type<"core" | "active">().notNull(),
    // FMP sector, overridable at underwriting to a risk group when theses are
    // correlated (IPS: correlated theses count as one sector).
    sector: text("sector"),
    conviction: integer("conviction"),
    promiseRank: integer("promise_rank"),
    keepDecision: text("keep_decision").$type<"keep" | "cut">(),
    // Ladder value; the post-reconcileActiveTargets value lives in allocation_targets.
    targetWeightPct: real("target_weight_pct"),
    thesis: text("thesis"),
    keyRisk: text("key_risk"),
    catalyst: text("catalyst"),
    // JSON array of 2–4 falsifiable statements; any one verified true ⇒ full exit.
    breakConditions: text("break_conditions"),
    horizonMonths: integer("horizon_months"),
    // Set by the finalize action = reviewed_at + horizon_months.
    expiresAt: text("expires_at"),
    entryZoneLow: real("entry_zone_low"),
    entryZoneHigh: real("entry_zone_high"),
    entryNote: text("entry_note"),
    addLevel: real("add_level"),
    addMaxSizePct: real("add_max_size_pct"),
    addNote: text("add_note"),
    // Stateful fact, not a derivation — written only by the UI action.
    addDownState: text("add_down_state")
      .$type<"available" | "used" | "void">()
      .notNull()
      .default("available"),
    // Forces a re-underwrite within 7 days — never a sale by itself.
    technicalBackstop: real("technical_backstop"),
    backstopNote: text("backstop_note"),
    technicalContext: text("technical_context"),
    status: text("status")
      .$type<"draft" | "final" | "superseded" | "rejected">()
      .notNull(),
    version: integer("version").notNull(),
    isCurrent: integer("is_current", { mode: "boolean" })
      .notNull()
      .default(false),
    source: text("source")
      .$type<"portfolio_review" | "underwrite_name" | "manual">()
      .notNull(),
    // Required on every version > 1; a displacement admission's reason must
    // name the displaced incumbent.
    changeReason: text("change_reason"),
    critiqueVerdict: text("critique_verdict").$type<"survives" | "overturned">(),
    critiqueCounter: text("critique_counter"),
    createdAt: text("created_at").notNull(),
    // Set only by the UI finalize action.
    reviewedAt: text("reviewed_at"),
  },
  (table) => [
    index("position_theses_ticker_idx").on(table.ticker),
    uniqueIndex("position_theses_ticker_version_idx").on(
      table.ticker,
      table.version,
    ),
  ]
);

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull(),
});
