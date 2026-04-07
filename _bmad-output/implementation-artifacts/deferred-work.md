# Deferred Work

## Deferred from: code review of 1-1-project-setup-with-database-and-seed-data (2026-04-06)

- No unique constraint on `market_data (symbol, type, date)` — non-unique index allows duplicate rows; queries need ORDER BY + LIMIT 1 for correctness
- No WAL mode or `busy_timeout` configured on SQLite connection — concurrent writes will throw SQLITE_BUSY under load
- DB connection singleton has no graceful shutdown hook — SIGTERM may not flush WAL/journal
- `quantity`/`price`/`fees` columns accept negative values with no CHECK constraint — downstream code must validate
- `date` TEXT column has no ISO 8601 format enforcement at DB level — relies on application convention
- `fee` rows have `quantity: 0, price: 0` — computation engine (Story 1.2) must guard against division by zero

## Deferred from: code review of 1-2-core-position-computation-engine (2026-04-06)

- Mixed currency within same ticker+portfolio group — `currency` taken from first transaction; no validation if group has inconsistent currencies
- ~~No currency conversion in `computeAggregates` — cross-currency sums are meaningless until FX conversion applied upstream (Story 1.3)~~ **RESOLVED in Story 1.3** — all positions now USD-denominated after FX conversion in `computePositions`
- NaN/Infinity from SQLite REAL columns propagate silently through all Decimal arithmetic without throwing
- Market data value of 0 treated as valid price — produces $0 market value for open positions; FMP service (Story 2.1) should filter
- Negative market data value silently produces negative market values and wildly wrong P&L; FMP service (Story 2.1) should validate
- Same-date transaction ordering uses `id` tiebreaker — real execution order may differ from insertion order
- Zero-quantity sell with fees produces negative `totalSellProceeds`
- Zero-quantity buy with non-zero fees inflates cost basis identically to a `fee` action type
- Case-sensitive ticker grouping — `AAPL` vs `aapl` produces separate positions; import flow should normalize
- Additional test coverage for edge cases: negative prices/fees on buy, single-position aggregates, hasInvalidState combined with market data
- Cost basis corruption on oversell — when sell qty exceeds sharesHeld, cost basis reduction overshoots (e.g., 15/10 * costBasis), producing negative costBasis; `hasInvalidState` is flagged but values are corrupted. Deferred: import validation (Story 5) will prevent oversells

## Deferred from: code review of 1-4-app-shell-navigation-formatting-and-empty-states (2026-04-07)

- NaN/Infinity propagation through all formatters — `formatCurrency`, `formatShares`, `formatPercent`, `formatPnL` accept `number | null` but don't guard against NaN/Infinity, producing garbled output like `"$NaN"` or `"+$∞"`. Low risk due to decimal.js server-side arithmetic, but a `Number.isFinite()` guard would close the gap.
- `getTransactionCount` crashes if DB/table doesn't exist — on fresh clone before `db:push`, all pages crash with `SqliteError: no such table: transactions`. First-run DX issue inherited from Story 1.1 DB setup.

## Deferred from: code review of 1-3-multi-currency-fx-conversion (2026-04-07)

- Truthiness check on `Decimal(0)` fragile pattern in `computeAggregates` — `totalValue ? .toNumber() : null` works because `Decimal(0)` is truthy (object), but would break if accumulators were refactored to `number | null`. Pre-existing from story 1.2, extended to `totalCostBasis`/`totalCashReturned`.
- FX rate value of zero/negative not validated in `lookupFxRate` — a zero rate silently zeroes all monetary values; a negative rate inverts them. FMP service (Story 2.1) or import validation (Story 5) should ensure positive FX rates.
- Mixed currencies in same ticker+portfolio group amplified by FX conversion — `currency` taken from first transaction in group; FX conversion now multiplies wrong-currency values by wrong rate. Pre-existing from story 1.2, worsened by FX.
- Aggregate null-propagation skips closed positions with null monetary fields — `computeAggregates` only nulls totals for non-closed positions with null values; a closed position with null fields is silently excluded. Currently unreachable because missingFxRate forces `isClosed: false`.
- O(n*m) FX lookup performance — `lookupFxRate` scans all rates linearly per transaction call. Negligible now, may need indexing when historical FX rates accumulate.

## Deferred from: code review of 2-1-fmp-service-and-market-data-server-actions (2026-04-07)

- Concurrent refreshes can create duplicate rows (TOCTOU race) [src/server/actions/market-data.ts] — check-then-insert without locking or upsert. Single-user localhost app makes this low-risk.
- Unbounded parallelism in FMP API calls [src/server/services/fmp.ts] — `Promise.all` with no concurrency limit. Seed data has ~10 tickers; will matter if portfolio grows to 100+.
