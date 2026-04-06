# Story 1.2: Core Position Computation Engine

Status: review

## Story

As a developer,
I want positions computed from transactions using weighted average cost with correct handling of buys, sells, dividends, and fees,
So that all portfolio metrics are accurate and verifiable against broker statements.

## Acceptance Criteria

1. **Given** a set of buy transactions for a ticker in a single portfolio, **When** `computePositions` processes them, **Then** average entry price = (total cost of all purchases + standalone fees) / total shares purchased, where buy fees are added to purchase cost (e.g., 100 shares at $10 with $5 fee = $1,005 cost, avg entry = $10.05), cost basis = total cost of all purchases including fees, shares held = total shares purchased (FR31).

2. **Given** a position with shares held and a sell transaction, **When** `computePositions` processes the sell, **Then** cost basis is reduced proportionally using weighted average cost (sold shares / total shares * cost basis), sell fees are deducted from sell proceeds (not added to cost basis), and sell proceeds are tracked separately per position (FR32, FR34).

3. **Given** a position with dividend transactions (some with negative amounts for withholding tax), **When** `computePositions` processes them, **Then** dividends are accumulated per position as the net sum (gross - withholding) and included in total P&L (FR33).

4. **Given** standalone fee transactions (not attached to a buy/sell), **When** `computePositions` processes them, **Then** the fee increases the position's cost basis and average entry price (FR40).

5. **Given** a position with market data available, **When** computing total P&L, **Then** total P&L = (current market value + total dividends received + total sell proceeds) - total amount invested (FR35), current market value = shares held x last price (FR36), cash returned = total dividends received + total sell proceeds (FR37).

6. **Given** transactions for the same ticker in different portfolios, **When** `computePositions` processes them, **Then** each ticker + portfolio combination is tracked as a separate position (FR38).

7. **Given** a position where all shares have been sold, **When** `computePositions` processes the transactions, **Then** the position is identified as closed (shares held = 0) with realized P&L (FR42).

8. **Given** a sell transaction that would result in more shares sold than currently held (processing in chronological order), **When** `computePositions` validates the transaction sequence, **Then** the system flags the invalid state (FR41).

9. **Given** all four action types exist in seed data, **When** `computePositions` processes them, **Then** buy, sell, dividend, and fee are all handled correctly per their respective rules (FR39).

10. **Given** the computation engine is implemented, **When** Vitest tests run against seed data, **Then** all tests pass verifying weighted average cost, cost basis reduction on sell, dividend accumulation, fee impact, P&L calculations, and position identification. All arithmetic uses `decimal.js` (no JavaScript float operations for financial math). Computation functions are pure (no DB imports, receive data as arguments).

## Tasks / Subtasks

- [x] Task 1: Define position types (AC: #1-#9)
  - [x] Create `src/server/types/positions.ts` with `ComputedPosition` type
  - [x] Define input types for transaction data the computation receives
  - [x] Define market data input types for price/FX lookups

- [x] Task 2: Implement `computePositions` in `src/server/services/computation.ts` (AC: #1-#9)
  - [x] Group transactions by ticker + portfolio (FR38)
  - [x] Sort transactions chronologically within each group
  - [x] Process buys: accumulate shares, accumulate cost basis with fees (FR31)
  - [x] Process sells: reduce cost basis proportionally via weighted average, track sell proceeds, deduct sell fees from proceeds (FR32, FR34)
  - [x] Process dividends: accumulate net dividends per position (FR33)
  - [x] Process standalone fees: increase cost basis and avg entry price (FR40)
  - [x] Guard against division by zero for fee rows (quantity: 0, price: 0)
  - [x] Flag negative share positions from invalid sell sequences (FR41)
  - [x] Identify closed positions (shares held = 0) (FR42)
  - [x] Compute price-dependent fields when market data available, return `null` when not (FR35, FR36)

- [x] Task 3: Implement `computeAggregates` in `src/server/services/computation.ts` (AC: #5)
  - [x] Compute total value, total cost basis, total P&L, cash returned across positions
  - [x] Compute position weight percentages (FR54)

- [x] Task 4: Write comprehensive Vitest tests in `src/server/services/computation.test.ts` (AC: #10)
  - [x] Test buy accumulation and average entry price calculation
  - [x] Test sell cost basis reduction with weighted average
  - [x] Test sell proceeds tracking (fees deducted from proceeds)
  - [x] Test dividend accumulation (including negative withholding)
  - [x] Test standalone fee impact on cost basis and avg entry
  - [x] Test total P&L formula with market data
  - [x] Test P&L returns null when no market data
  - [x] Test ticker + portfolio isolation (same ticker, different portfolios)
  - [x] Test closed position identification
  - [x] Test negative share flagging (sell exceeding held shares)
  - [x] Test fee row division-by-zero safety
  - [x] Test with seed data scenarios for integration confidence

## Dev Notes

### Computation Architecture

**Pure functions, no side effects, no DB imports.** The computation service receives data as arguments and returns structured results. It does NOT import from `src/server/db/` or `drizzle-orm`.

```
src/server/services/computation.ts      # computePositions, computeAggregates
src/server/services/computation.test.ts  # Co-located tests
```

**Data flow (this story is service-layer only — no queries/actions yet):**
```
Transaction[] + MarketData[] → computePositions() → ComputedPosition[]
ComputedPosition[] → computeAggregates() → AggregateMetrics
```

### decimal.js Usage — Critical Patterns

All financial arithmetic MUST use decimal.js. Never use JavaScript `+`, `-`, `*`, `/` on financial values.

```typescript
import Decimal from "decimal.js";

// Construction from DB values (number type from SQLite REAL)
const price = new Decimal(transaction.price);
const qty = new Decimal(transaction.quantity);
const fees = new Decimal(transaction.fees);

// Arithmetic
const cost = price.times(qty).plus(fees);       // buy cost with fees
const avgEntry = totalCost.div(totalShares);     // weighted average
const reduction = soldShares.div(totalShares).times(costBasis); // proportional cost basis reduction

// Comparison
if (sharesHeld.lessThan(0)) { /* flag invalid */ }
if (sharesHeld.isZero()) { /* closed position */ }

// Output — convert to number ONLY at the return boundary
return { sharesHeld: sharesHeld.toNumber(), avgEntry: avgEntry.toNumber() };
```

**Key decimal.js methods:** `plus()`, `minus()`, `times()`, `div()`, `isZero()`, `lessThan()`, `greaterThan()`, `equals()`, `toNumber()`, `new Decimal(0)` for initialization.

### Transaction Action Type Processing Rules

| Action | Shares | Cost Basis | Avg Entry | Sell Proceeds | Dividends |
|--------|--------|------------|-----------|---------------|-----------|
| **buy** | +quantity | +(price * qty + fees) | Recalculated | — | — |
| **sell** | -quantity | -(soldShares/totalShares * costBasis) | Unchanged | +(price * qty - fees) | — |
| **dividend** | — | — | — | — | +(quantity * price) net |
| **fee** | — | +fees | Recalculated | — | — |

**Critical edge cases from seed data:**
- Fee rows have `quantity: 0, price: 0` — guard against division by zero when recalculating avg entry after fee
- Dividend `quantity * price` gives gross amount; negative price values represent withholding tax
- Sell fees deducted from proceeds, NOT added to cost basis

### Seed Data Reference (for test verification)

**US Growth — AAPL (partial sell, open position):**
- Buy 50 @ $185.50, fees $4.99 → cost = $9,279.99
- Buy 30 @ $192.00, fees $4.99 → cost = $5,764.99
- Total: 80 shares, cost basis = $15,044.98, avg entry = $188.0623
- Sell 20 @ $210.75, fees $4.99 → proceeds = $4,210.01, cost basis reduced by 20/80 * $15,044.98 = $3,761.245
- After sell: 60 shares, cost basis = $11,283.735
- Dividend: 60 * $0.25 = $15.00
- Market price: $215.30 → market value = $12,918.00
- Total P&L = ($12,918.00 + $15.00 + $4,210.01) - $15,044.98 = $2,098.03

**US Growth — MSFT (standalone fee):**
- Buy 25 @ $340.00, fees $4.99 → cost = $8,504.99
- Dividend: 25 * $0.75 = $18.75
- Fee: $12.50 → cost basis = $8,517.49, avg entry = $8,517.49 / 25 = $340.6996
- Market price: $365.80 → market value = $9,145.00
- Total P&L = ($9,145.00 + $18.75 + $0) - $8,517.49 = $646.26

**UK Income — VOD.L (closed position, GBP — FX deferred to Story 1.3):**
- Buy 500 @ 0.72, fees 8.00 → cost = 368.00
- Dividend: 500 * 0.02 = 10.00
- Sell 500 @ 0.85, fees 8.00 → proceeds = 417.00
- Closed: 0 shares, realized P&L = (0 + 10.00 + 417.00) - 368.00 = 59.00

**UK Income — AAPL (separate position from US Growth AAPL):**
- Buy 15 @ $195.00, fees $9.99 → cost = $2,934.99, avg entry = $195.666

**EU Diversified — SAP.DE (EUR — FX deferred to Story 1.3):**
- Buy 40 @ 165.30, fees 6.50 → cost = 6,618.50
- Dividend: 40 * 2.20 = 88.00

### FX Conversion — NOT in Scope for This Story

Story 1.2 operates in **native currency only**. All values stay in the transaction's original currency. FX conversion to USD is Story 1.3. The computation engine should be structured so that Story 1.3 can add FX conversion without rewriting the core logic — pass market data that includes FX rates, and add a conversion step.

For this story, when computing market value and P&L that require a price, use the raw last price from market_data without FX conversion.

### Nullable Price-Dependent Fields

When no market data exists for a position's ticker, the following fields MUST be `null` (not 0, not undefined):
- `marketValue`
- `totalPnl`
- `lastPrice`
- `weight` (in aggregates)

UI will display "N/A" for null values (FR52). Use `null` consistently — never `undefined`.

### ComputedPosition Type Design

```typescript
// src/server/types/positions.ts
export interface ComputedPosition {
  ticker: string;
  portfolio: string;
  currency: string;
  sharesHeld: number;
  avgEntryPrice: number;
  costBasis: number;
  lastPrice: number | null;       // null when no market data
  marketValue: number | null;     // null when no market data
  totalDividends: number;
  totalSellProceeds: number;
  totalInvested: number;          // total amount put in (sum of buy costs + standalone fees)
  totalPnl: number | null;        // null when no market data
  cashReturned: number;           // dividends + sell proceeds
  isClosed: boolean;
  hasInvalidState: boolean;       // true if sell exceeded shares at any point
}
```

### Performance Target

Position computation for 1400+ transactions must complete within 2 seconds. With SQLite and in-memory processing, this should be easily achievable. No premature optimization needed — straightforward iteration is sufficient.

### Project Structure Notes

- `src/server/services/` directory does NOT exist yet — create it
- `src/server/types/positions.ts` does NOT exist yet — create it
- `src/server/types/market-data.ts` does NOT exist yet — create it if needed for input types
- Existing `src/server/types/action-result.ts` is NOT relevant to this story (no Server Actions)
- Existing `src/server/db/schema.ts` defines the transaction/market_data shapes but do NOT import it in computation.ts — define input types separately to maintain purity

### Previous Story Intelligence (1.1)

**Patterns established:**
- TypeScript strict mode enabled
- Path alias `@/` maps to `./src`
- Vitest globals enabled (no need to import describe/it/expect)
- Co-located test files with `.test.ts` suffix
- `.env.local` contains real FMP API key (not relevant for this story)
- Seed data: 13 transactions, 11 market data rows (4 stock prices, 7 FX rates)

**Deferred issues from 1.1 code review that impact this story:**
- Fee rows have `quantity: 0, price: 0` — MUST guard against division by zero
- No CHECK constraints on negative values — computation must handle gracefully
- No unique constraint on market_data — if querying, use ORDER BY + LIMIT 1

**Code review corrections applied:**
- Seed script wrapped in `db.transaction()` for atomicity
- `data/.gitkeep` added for directory tracking
- `.env` added to `.gitignore`

### Anti-Patterns to Avoid

- Do NOT import from `src/server/db/` in computation.ts — receive data as arguments
- Do NOT import `decimal.js` in any client code
- Do NOT use JavaScript `number` arithmetic for financial math
- Do NOT use `undefined` — use `null` for absent values
- Do NOT store computed results in the database
- Do NOT create barrel files (no `index.ts` re-exports)
- Do NOT use `new Date()` — use `date-fns` if dates needed
- Do NOT handle FX conversion — that's Story 1.3

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.2]
- [Source: _bmad-output/planning-artifacts/prd.md — FR31-FR42, FR52-FR54]
- [Source: _bmad-output/planning-artifacts/architecture.md — Computation Service, Data Flow, Anti-Patterns]
- [Source: _bmad-output/implementation-artifacts/1-1-project-setup-with-database-and-seed-data.md — Dev Notes, Review Feedback]
- [Source: _bmad-output/implementation-artifacts/deferred-work.md — Division by zero risk, missing constraints]
- [Source: src/server/db/schema.ts — Transaction and MarketData column definitions]
- [Source: src/server/db/seed.ts — Test data with expected computation values]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Parse error in test file from misplaced `});` closing brace — fixed immediately

### Completion Notes List

- Task 1: Created `src/server/types/positions.ts` with `ComputedPosition`, `TransactionInput`, `MarketDataInput`, and `AggregateMetrics` types. Types defined independently from DB schema to maintain computation service purity.
- Task 2: Implemented `computePositions` in `src/server/services/computation.ts`. Pure function receiving transactions and market data as arguments. All financial arithmetic uses `decimal.js`. Handles all four action types (buy, sell, dividend, fee). Groups by ticker+portfolio, sorts chronologically, guards against division by zero on fee rows, flags negative share states, identifies closed positions, returns `null` for price-dependent fields when no market data. Closed positions get realized P&L computed without requiring market data.
- Task 3: Implemented `computeAggregates` in same file. Computes total value, cost basis, P&L, cash returned. Calculates position weight percentages. Returns `null` for totalValue/totalPnl/weights when any open position lacks market data. Closed positions contribute realized P&L to totals.
- Task 4: Wrote 20 comprehensive tests (17 for computePositions, 4 for computeAggregates) covering all ACs. Tests verified against exact seed data reference values from story Dev Notes. All tests pass, full suite (34 tests across 5 files) passes with no regressions.

### Change Log

- 2026-04-06: Implemented story 1.2 — Core Position Computation Engine. Created types, computation service with `computePositions` and `computeAggregates`, and comprehensive test suite (20 tests). All 34 tests pass, lint clean.

### File List

- `src/server/types/positions.ts` (new) — ComputedPosition, TransactionInput, MarketDataInput, AggregateMetrics types
- `src/server/services/computation.ts` (new) — computePositions, computeAggregates pure functions
- `src/server/services/computation.test.ts` (new) — 20 comprehensive tests for computation engine
