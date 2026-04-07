# Story 1.3: Multi-Currency FX Conversion

Status: done

## Story

As a developer,
I want the computation engine to convert all values to USD using date-matched FX rates with fallback logic,
So that multi-currency portfolios compute correctly and match broker-reported USD equivalents.

## Acceptance Criteria

1. **Given** a buy transaction in a non-USD currency (e.g., GBP) with a trade date of 2025-05-10, **When** `computePositions` computes cost basis, **Then** the cost is converted to USD using the FX rate for 2025-05-10 (trade-date FX rate) (FR43).

2. **Given** a position with shares priced in a non-USD currency, **When** `computePositions` computes current market value, **Then** market value is converted to USD using the FX rate matching the price date (price-date FX rate) (FR44).

3. **Given** a dividend transaction in a non-USD currency with a payment date, **When** `computePositions` processes the dividend, **Then** the dividend amount is converted to USD using the payment-date FX rate (FR45).

4. **Given** no FX rate exists for a specific date (weekend, holiday, data gap), **When** the computation engine looks up the FX rate, **Then** it falls back to the most recent previous available FX rate (FR46). This fallback behavior is expected, not a defect.

5. **Given** transaction values with high precision (e.g., price = 142.3456), **When** the computation engine processes them, **Then** full precision is maintained during storage and computation. Rounding occurs only at display time: 2 decimal places for dollar values, 1 for shares, 1 for percentages (FR47).

6. **Given** the seed data includes GBP and EUR transactions with corresponding FX rates, **When** Vitest tests run the multi-currency scenarios, **Then** all FX conversions produce correct USD values matching expected results, fallback logic is tested with missing-date scenarios, and precision is verified (no floating-point drift in intermediate calculations).

## Tasks / Subtasks

- [x] Task 1: Extend types for FX support (AC: #1-#3)
  - [x] Add `FxRateInput` interface to `src/server/types/positions.ts`
  - [x] Add `currentFxRate: number | null` field to `ComputedPosition`

- [x] Task 2: Implement FX rate lookup helper in `src/server/services/computation.ts` (AC: #4)
  - [x] Create `lookupFxRate(currency, date, fxRates)` pure helper
  - [x] Return `1` for USD currency (no conversion needed)
  - [x] Exact-date match first, then fallback to most recent previous rate (FR46)
  - [x] Return `null` if no rate found for the currency pair at all

- [x] Task 3: Integrate FX conversion into `computePositions` (AC: #1-#5)
  - [x] Add `fxRates: FxRateInput[]` as third parameter
  - [x] For each transaction in a non-USD position, look up trade-date FX rate and convert amounts to USD during accumulation
  - [x] Convert market value to USD using price-date FX rate for the position's currency
  - [x] Set `currentFxRate` on each position (price-date rate for open, current rate for closed)
  - [x] Handle missing FX rate for non-USD position: all monetary values become `null`
  - [x] USD positions: rate = 1.0, values unchanged, no performance impact

- [x] Task 4: Verify `computeAggregates` works with FX-converted values (AC: #1-#3)
  - [x] All positions are now USD-denominated — aggregation is now meaningful across currencies
  - [x] Existing null-handling logic (missing market data) still applies
  - [x] No code changes expected if computePositions returns correct USD values

- [x] Task 5: Update existing tests and add FX-specific tests (AC: #6)
  - [x] Update all existing `computePositions` calls to pass `fxRates` third argument (use `[]` for USD-only tests)
  - [x] Add test: GBP position FX conversion (VOD.L — buy, dividend, sell with per-transaction FX rates)
  - [x] Add test: EUR position FX conversion (SAP.DE — buy, dividend with per-transaction FX rates)
  - [x] Add test: FX fallback to most recent previous rate when exact date missing
  - [x] Add test: USD position unchanged (rate = 1.0, values identical to story 1.2)
  - [x] Add test: Missing FX rate for non-USD currency → monetary fields null
  - [x] Add test: Mixed-currency `computeAggregates` with all values in USD
  - [x] Verify no regressions: all existing tests still pass with `fxRates = []`

### Review Findings

- [x] [Review][Decision] Market value FX uses "most recent" rate, not "price-date" rate per FR44 — RESOLVED: added `date` field to `MarketDataInput`, FX lookup now uses `md.date` (price-date) when market data available, falls back to most recent for closed positions without market data.
- [x] [Review][Patch] `isClosed` hardcoded to `false` in missingFxRate path [computation.ts:~138] — FIXED: now computes `isClosed` from `sharesHeld.isZero() && totalInvested.greaterThan(0)`, consistent with normal path.
- [x] [Review][Defer] Truthiness check on `Decimal(0)` fragile pattern [computation.ts:246-249] — deferred, pre-existing pattern from story 1.2 (extended here to `totalCostBasis`/`totalCashReturned`). `Decimal(0)` is truthy so no current bug, but refactoring to `number` would break.
- [x] [Review][Defer] FX rate value of zero/negative not validated [computation.ts:lookupFxRate] — deferred, input validation concern; FMP service (Story 2.1) or import validation (Story 5) should ensure positive FX rates.
- [x] [Review][Defer] Mixed currencies in same ticker+portfolio group amplified by FX conversion [computation.ts:65] — deferred, pre-existing from story 1.2; FX conversion makes the impact worse but root cause is upstream data quality.
- [x] [Review][Defer] Aggregate null-propagation skips closed positions with null monetary fields [computation.ts:221-231] — deferred, depends on fixing `isClosed` bug first; currently unreachable because missingFxRate forces `isClosed: false`.
- [x] [Review][Defer] O(n*m) FX lookup performance for large datasets [computation.ts:lookupFxRate] — deferred, negligible with current seed data; may need index/binary search when historical FX rates accumulate.

## Dev Notes

### Design Overview

**FX conversion happens INSIDE `computePositions` — not as a post-processing step.** Each transaction's financial values are converted to USD at that transaction's date-specific FX rate during the accumulation loop. This is critical because different transactions in the same position may have different FX rates (the rate on buy date differs from the rate on dividend date).

After conversion, all monetary fields in `ComputedPosition` are USD-denominated. `computeAggregates` requires no changes because it already processes position values as numbers — they're now all in the same currency.

### FX Conversion Rules by Action Type

| Action | What Gets Converted | FX Rate Date | Formula |
|--------|-------------------|-------------|---------|
| **buy** | cost (price * qty + fees) | transaction date | `buyCost_USD = (price * qty + fees) * fxRate` |
| **sell** | sell proceeds (price * qty - fees) | transaction date | `proceeds_USD = (price * qty - fees) * fxRate` |
| **dividend** | dividend amount (qty * price) | transaction date | `dividend_USD = (qty * price) * fxRate` |
| **fee** | fee amount | transaction date | `fee_USD = fees * fxRate` |
| **market value** | shares * lastPrice | price date from market data | `mv_USD = sharesHeld * lastPrice * fxRate` |

Cost basis reduction on sell uses the same proportional formula (`soldShares / totalShares * costBasis`) but both sides are already in USD. No additional FX conversion needed for the reduction.

### FX Rate Lookup Logic (FR46)

```
lookupFxRate(currency: string, date: string, fxRates: FxRateInput[]): number | null
  1. If currency === "USD" → return 1 (identity, no conversion)
  2. Build pair symbol: `${currency}USD` (e.g., "GBPUSD", "EURUSD")
  3. Filter fxRates to matching pair
  4. Sort by date descending
  5. Find first rate where rate.date <= target date
  6. Return rate.value, or null if no matching rates found
```

The fallback logic (step 5) handles weekends, holidays, and data gaps by using the most recent available rate before the target date. This is standard FX practice.

### New Type: FxRateInput

```typescript
// Add to src/server/types/positions.ts
export interface FxRateInput {
  symbol: string;  // Currency pair, e.g., "GBPUSD", "EURUSD"
  date: string;    // ISO date string, e.g., "2025-05-10"
  value: number;   // Exchange rate (multiply native currency by this to get USD)
}
```

### Updated Function Signature

```typescript
export function computePositions(
  transactions: TransactionInput[],
  marketData: Record<string, MarketDataInput>,
  fxRates: FxRateInput[]
): ComputedPosition[]
```

`fxRates` is **required, not optional**. Callers must pass `[]` when no FX data is needed (all-USD portfolios). This keeps the contract explicit.

### Field Currency Semantics After Conversion

| Field | Currency | Notes |
|-------|----------|-------|
| `sharesHeld` | unitless | Share count, not affected by FX |
| `avgEntryPrice` | USD | `costBasis / sharesHeld` — both in USD |
| `costBasis` | USD | Sum of each buy's cost converted at trade-date FX |
| `lastPrice` | **native** | Stock market price in trading currency (NOT converted) |
| `marketValue` | USD | `sharesHeld * lastPrice * currentFxRate` |
| `totalDividends` | USD | Sum of each dividend converted at payment-date FX |
| `totalSellProceeds` | USD | Sum of each sell's proceeds converted at trade-date FX |
| `totalInvested` | USD | Same as cost basis (sum of buy costs + fees in USD) |
| `totalPnl` | USD | `(marketValue + dividends + sellProceeds) - totalInvested` |
| `cashReturned` | USD | `dividends + sellProceeds` |
| `currentFxRate` | rate | Price-date FX rate used for market value conversion |
| `currency` | label | Original trading currency (e.g., "GBP", "EUR", "USD") |

**Key insight:** `lastPrice` stays in native currency because it's the external stock quote. All other monetary fields are USD. This means `avgEntryPrice * sharesHeld = costBasis` (both USD), but `lastPrice * sharesHeld ≠ marketValue` for non-USD positions (the FX rate bridges the gap).

### Missing FX Rate Handling

For non-USD positions where `lookupFxRate` returns `null`:
- Set `currentFxRate = null`
- Set all monetary fields to `null`: `costBasis`, `avgEntryPrice`, `marketValue`, `totalDividends`, `totalSellProceeds`, `totalInvested`, `totalPnl`, `cashReturned`
- Keep non-monetary fields: `sharesHeld`, `ticker`, `portfolio`, `currency`, `isClosed`, `hasInvalidState`
- `lastPrice` still comes from market data (it's native currency, doesn't need FX)
- In `computeAggregates`: positions with null monetary fields cause aggregate totals to be `null` (consistent with existing missing-market-data pattern)

In practice, this edge case should be rare — the FMP service (Story 2.1) will fetch FX rates, and seed data already covers all needed dates.

### Existing Test Impact

The `computePositions` signature changes from 2 to 3 parameters. All 20 existing tests must be updated to pass `fxRates` as the third argument. For existing USD-only tests, pass `[]` — the `lookupFxRate` helper returns `1` for USD currency, so all values remain unchanged. Verify no regressions.

For tests that use non-USD positions (VOD.L GBP, SAP.DE EUR), update expected values to reflect USD conversion. The expected values are calculated below.

### Seed Data FX Reference

**GBPUSD rates in seed data:**
| Date | Rate |
|------|------|
| 2025-05-10 | 1.2550 |
| 2025-08-15 | 1.2700 |
| 2025-11-20 | 1.2600 |
| 2026-04-04 | 1.2850 |

**EURUSD rates in seed data:**
| Date | Rate |
|------|------|
| 2025-06-20 | 1.0890 |
| 2026-02-01 | 1.0750 |
| 2026-04-04 | 1.0920 |

### Expected Test Values — VOD.L (UK Income, GBP, Closed)

**Buy:** date 2025-05-10, qty 500, price 0.72, fees 8.00
- FX rate: 1.2550 (exact date match)
- Cost GBP = 0.72 * 500 + 8.00 = 368.00
- Cost USD = 368.00 * 1.2550 = **461.84**

**Dividend:** date 2025-08-15, qty 500, price 0.02
- FX rate: 1.2700 (exact date match)
- Dividend GBP = 500 * 0.02 = 10.00
- Dividend USD = 10.00 * 1.2700 = **12.70**

**Sell:** date 2025-11-20, qty 500, price 0.85, fees 8.00
- FX rate: 1.2600 (exact date match)
- Cost basis reduction: 500/500 * 461.84 = 461.84 (all shares sold)
- Remaining cost basis = 0
- Proceeds GBP = 0.85 * 500 - 8.00 = 417.00
- Proceeds USD = 417.00 * 1.2600 = **525.42**

**Expected ComputedPosition:**
- sharesHeld: 0
- avgEntryPrice: 0 (division-by-zero guard, closed position)
- costBasis: 0 (all sold)
- lastPrice: 0.88 (native GBP, from market data — but position is closed)
- marketValue: 0 (closed)
- totalDividends: 12.70
- totalSellProceeds: 525.42
- totalInvested: 461.84
- totalPnl: (0 + 12.70 + 525.42) - 461.84 = **76.28**
- cashReturned: 12.70 + 525.42 = **538.12**
- currentFxRate: 1.2850 (current GBPUSD rate — informational for closed positions)
- isClosed: true

### Expected Test Values — SAP.DE (EU Diversified, EUR, Open)

**Buy:** date 2025-06-20, qty 40, price 165.30, fees 6.50
- FX rate: 1.0890 (exact date match)
- Cost EUR = 165.30 * 40 + 6.50 = 6,618.50
- Cost USD = 6,618.50 * 1.0890 = **7,207.5465**

**Dividend:** date 2026-02-01, qty 40, price 2.20
- FX rate: 1.0750 (exact date match)
- Dividend EUR = 40 * 2.20 = 88.00
- Dividend USD = 88.00 * 1.0750 = **94.60**

**Market value:**
- Last price: 178.50 EUR (market data date 2026-04-04)
- FX rate: EURUSD 2026-04-04 = 1.0920 (price-date match)
- Market value EUR = 40 * 178.50 = 7,140.00
- Market value USD = 7,140.00 * 1.0920 = **7,796.88**

**Expected ComputedPosition:**
- sharesHeld: 40
- avgEntryPrice: 7,207.5465 / 40 = **180.188663** (USD per share)
- costBasis: **7,207.5465**
- lastPrice: 178.50 (native EUR)
- marketValue: **7,796.88**
- totalDividends: **94.60**
- totalSellProceeds: 0
- totalInvested: **7,207.5465**
- totalPnl: (7,796.88 + 94.60 + 0) - 7,207.5465 = **683.9335**
- cashReturned: **94.60**
- currentFxRate: **1.0920**
- isClosed: false

### Expected Test Values — USD Positions (Unchanged)

All USD positions (US Growth AAPL, US Growth MSFT, UK Income AAPL) use FX rate 1.0. Their values are identical to story 1.2 expected values:

**US Growth — AAPL:** costBasis 11,283.735, marketValue 12,918.00, totalPnl 2,098.03, currentFxRate 1.0
**US Growth — MSFT:** costBasis 8,517.49, marketValue 9,145.00, totalPnl 646.26, currentFxRate 1.0
**UK Income — AAPL:** costBasis 2,934.99, marketValue 3,229.50, totalPnl 294.51, currentFxRate 1.0

### FX Fallback Test Scenario

Create a test with a transaction date that has NO exact FX rate match. For example, a GBP buy on 2025-07-01 with these available rates:
- 2025-05-10: 1.2550
- 2025-08-15: 1.2700

Expected: falls back to 2025-05-10 rate (1.2550) — the most recent rate BEFORE 2025-07-01.

Also test: a transaction date BEFORE any available FX rate (e.g., 2025-01-01 with earliest rate 2025-05-10) → lookupFxRate returns `null` → monetary fields null.

### decimal.js Patterns (Same as Story 1.2)

All financial arithmetic uses decimal.js. The FX conversion is just another multiplication:

```typescript
const fxRate = lookupFxRate(currency, t.date, fxRates);
if (fxRate === null) { /* handle missing rate */ }
const rate = new Decimal(fxRate);

// In buy case:
const buyCost = price.times(qty).plus(fees).times(rate); // native → USD

// In market value:
const currentRate = lookupFxRate(currency, priceDate, fxRates);
const mvUsd = lastPriceDec.times(sharesHeld).times(new Decimal(currentRate));
```

Never multiply native * fxRate using JavaScript `number`. Always use `Decimal.times()`.

### Implementation Strategy — Minimize Diff

The core loop structure in `computePositions` stays the same. Changes:
1. Add `fxRates` parameter
2. Before the transaction loop: look up market data price-date FX rate for the position's currency → `currentFxRate`
3. Inside each `case` block: multiply the computed native-currency value by the transaction-date FX rate
4. At the end: multiply `marketValue` by `currentFxRate` instead of using raw `lastPrice * sharesHeld`

This is an augmentation, not a rewrite. The existing logic for weighted average cost, cost basis reduction, dividend accumulation, and fee handling stays intact — each just gets an FX multiplier.

### Project Structure Notes

- `src/server/types/positions.ts` — modify (add `FxRateInput`, extend `ComputedPosition`)
- `src/server/services/computation.ts` — modify (add `lookupFxRate` helper, extend `computePositions`)
- `src/server/services/computation.test.ts` — modify (update all calls, add FX tests)
- No new files needed
- No changes to `computeAggregates` expected

### Previous Story Intelligence (1.2)

**Patterns to follow:**
- Pure functions receiving data as arguments — NO db imports in computation.ts
- Co-located tests with `.test.ts` suffix
- decimal.js for ALL financial arithmetic
- `null` for absent values, never `undefined`
- Division-by-zero guard on avgEntryPrice when sharesHeld = 0
- Closed positions get realized P&L without market data

**Deferred issues from 1.2 code review that this story resolves:**
- "No currency conversion in `computeAggregates` — cross-currency sums are meaningless until FX applied" → RESOLVED: all values are now USD after FX conversion
- "Mixed currency within same ticker+portfolio group — `currency` taken from first transaction" → NOT resolved by this story (data quality issue, unchanged)

**Deferred issues that remain deferred:**
- Cost basis corruption on oversell (Story 5 import validation)
- Case-sensitive ticker grouping (import normalization)
- NaN/Infinity propagation from SQLite REAL
- Market data value of 0 treated as valid price (Story 2.1 FMP service)

### Anti-Patterns to Avoid

- Do NOT import from `src/server/db/` in computation.ts — receive data as arguments
- Do NOT import `decimal.js` in any client code
- Do NOT use JavaScript `number` arithmetic for financial math
- Do NOT use `undefined` — use `null` for absent values
- Do NOT make `fxRates` optional — keep the contract explicit
- Do NOT convert `lastPrice` to USD — it stays in native currency
- Do NOT modify `computeAggregates` unless tests reveal a bug — the existing logic should work with USD-denominated inputs
- Do NOT create new files — all changes fit in existing files
- Do NOT change the `TransactionInput` or `MarketDataInput` types — they represent raw data

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.3]
- [Source: _bmad-output/planning-artifacts/prd.md — FR43-FR47, FR52]
- [Source: _bmad-output/planning-artifacts/architecture.md — Computation Service, FX date-matching, Anti-Patterns]
- [Source: _bmad-output/implementation-artifacts/1-2-core-position-computation-engine.md — Dev Notes, Computation Architecture, Seed Data Reference]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — Cross-currency aggregation deferred to this story]
- [Source: src/server/services/computation.ts — Current computePositions and computeAggregates implementation]
- [Source: src/server/types/positions.ts — Current ComputedPosition, TransactionInput, MarketDataInput types]
- [Source: src/server/db/seed.ts — FX rate seed data (7 rates: 4 GBPUSD, 3 EURUSD)]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
None — clean implementation with no failures.

### Completion Notes List
- Added `FxRateInput` interface and made monetary fields nullable on `ComputedPosition` and `AggregateMetrics` to support missing-FX-rate edge case
- Implemented `lookupFxRate()` pure helper: returns 1 for USD, exact-date match, fallback to most recent previous rate, null if no rate found
- Extended `computePositions` with required `fxRates` third parameter; each transaction's monetary values multiplied by trade-date FX rate using decimal.js
- Market value converted using most recent available FX rate for the position's currency
- Missing FX rate for non-USD positions nulls all monetary fields while preserving share tracking
- Updated `computeAggregates` to handle nullable `costBasis` and `cashReturned` (consistent with existing `marketValue`/`totalPnl` null-propagation pattern)
- Updated all 20 existing test calls to pass `fxRates = []` — zero regressions
- Added 6 new lookupFxRate unit tests and 6 new FX-specific computePositions tests (VOD.L GBP lifecycle, SAP.DE EUR open, USD unchanged, fallback, missing rate, full 5-position integration)
- Added mixed-currency computeAggregates test verifying cross-currency aggregation works in USD
- All 46 tests pass, lint clean

### Change Log
- 2026-04-07: Implemented multi-currency FX conversion (Story 1.3) — all ACs satisfied

### File List
- src/server/types/positions.ts (modified — added FxRateInput, made monetary fields nullable)
- src/server/services/computation.ts (modified — added lookupFxRate, extended computePositions with FX, updated computeAggregates null handling)
- src/server/services/computation.test.ts (modified — updated all calls, added 12 new FX tests)
