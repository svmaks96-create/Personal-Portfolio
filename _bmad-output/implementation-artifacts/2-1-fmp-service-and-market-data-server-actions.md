# Story 2.1: FMP Service & Market Data Server Actions

Status: review

## Story

As a developer,
I want the FMP API integration to fetch and persist stock prices and FX rates on demand,
So that the dashboard and positions views have current market data to compute valuations.

## Acceptance Criteria

1. **Given** the FMP API key is configured in `.env.local`
   **When** the `refreshPrices` Server Action is called
   **Then** it calls `fetchStockPrices` in `src/server/services/fmp.ts` with all unique tickers from the transactions table
   **And** stock quotes are batched to minimize API calls
   **And** results are written to the `market_data` table with type `stock_price`, the current date, and `fetched_at` timestamp
   **And** `revalidatePath('/', 'layout')` is called to trigger re-render
   **And** an `ActionResult` is returned (success with data or failure with descriptive error message) (FR48)

2. **Given** non-USD currencies exist in the transactions table
   **When** the `refreshFxRates` Server Action is called
   **Then** it calls `fetchFxRates` in `src/server/services/fmp.ts` for all unique non-USD currencies
   **And** results are written to the `market_data` table with type `fx_rate`, the current date, and `fetched_at` timestamp
   **And** `revalidatePath('/', 'layout')` is called
   **And** an `ActionResult` is returned (FR49)

3. **Given** prices or FX rates have already been fetched for today's date
   **When** a refresh action is called again within the same session
   **Then** the system avoids redundant API calls if data for today already exists in `market_data` (FR51)

4. **Given** the FMP API is unreachable or returns an error
   **When** a refresh action is called
   **Then** the action returns `ActionResult` with `success: false` and a descriptive error message (never raw API response)
   **And** existing market data in the table remains unchanged (graceful degradation)

5. **Given** the FMP service layer is implemented
   **When** I examine the code
   **Then** `src/server/services/fmp.ts` is the only file making HTTP calls to FMP
   **And** FMP functions are pure (framework-agnostic, no DB imports)
   **And** Server Actions orchestrate: call service → write to market_data → revalidate
   **And** `refreshPrices` and `refreshFxRates` are separate actions for independent failure modes

## Tasks / Subtasks

- [x] Task 1: Create FMP service layer (AC: #1, #2, #4, #5)
  - [x] 1.1 Create `src/server/services/fmp.ts` with `fetchStockPrices(tickers: string[]): Promise<FmpQuote[]>`
  - [x] 1.2 Add `fetchFxRates(currencies: string[]): Promise<FmpFxQuote[]>` to fmp.ts
  - [x] 1.3 Add typed response interfaces for FMP API responses
  - [x] 1.4 Read API key from `config.fmpApiKey` (imported from `@/server/config`)
  - [x] 1.5 Handle HTTP errors gracefully — return empty arrays or throw descriptive errors, never raw API responses

- [x] Task 2: Create market data Server Actions (AC: #1, #2, #3, #5)
  - [x] 2.1 Create `src/server/actions/market-data.ts` with `refreshPrices()` Server Action
  - [x] 2.2 Add `refreshFxRates()` Server Action
  - [x] 2.3 Each action: query unique tickers/currencies from transactions → check existing today's data → call FMP service → write to market_data → revalidatePath('/', 'layout') → return ActionResult

- [x] Task 3: Create market data query helpers (AC: #3)
  - [x] 3.1 Create `src/server/queries/market-data.ts` with helpers to check if today's data exists
  - [x] 3.2 Add query to get the latest `fetched_at` timestamp for price freshness display (needed by Story 2.3)

- [x] Task 4: Create types for market data (AC: #5)
  - [x] 4.1 Create `src/server/types/market-data.ts` with FMP response types and refresh result types

- [x] Task 5: Write unit tests for FMP service (AC: #1, #2, #4)
  - [x] 5.1 Create `src/server/services/fmp.test.ts` — test fetchStockPrices and fetchFxRates with mocked fetch
  - [x] 5.2 Test error handling: network failure, invalid JSON, empty response, partial failures
  - [x] 5.3 Test that functions are pure — no DB or framework imports

## Dev Notes

### CRITICAL: FMP API Endpoint Details (Verified Live)

**Stock Prices — Use `quote-short` endpoint:**
```
GET https://financialmodelingprep.com/api/v3/quote-short/{SYMBOL}?apikey={KEY}
Response: [{ "symbol": "AAPL", "price": 258.86, "change": 2.94, "volume": 29319825 }]
```

**FX Rates — Use `forex-quote-short` endpoint:**
```
GET https://financialmodelingprep.com/api/v3/forex-quote-short/{PAIR}?apikey={KEY}
Response: [{ "symbol": "GBPUSD", "price": 1.32344, "change": 0.00025, "volume": 71487 }]
```

**Batching strategy:** The batch endpoints (`batch-quote`, `batch-quote-short`) return HTTP 402 on the current FMP plan. Comma-separated symbols in the URL path also don't work. **You MUST call `quote-short` individually per ticker.** To minimize latency, use `Promise.all()` to parallelize all fetch calls. For FX rates, call `forex-quote-short` individually per currency pair (e.g., `GBPUSD`, `EURUSD`).

**FMP base URL:** `https://financialmodelingprep.com/api/v3`

**API key access:** Import from `@/server/config` — `config.fmpApiKey`. This is the ONLY file that reads `process.env`. Never access `process.env.FMP_API_KEY` directly in fmp.ts.

### FMP Service Design — Pure Functions, No DB

The FMP service (`src/server/services/fmp.ts`) MUST be pure:
- Receives ticker/currency arrays as arguments
- Makes HTTP calls to FMP API
- Returns typed response data
- Does NOT import from `drizzle-orm`, `@/server/db`, or any framework code
- Does NOT write to the database
- Does NOT call `revalidatePath`

Server Actions in `src/server/actions/market-data.ts` orchestrate the full flow:
1. Query unique tickers/currencies from transactions table
2. Check if today's data already exists in market_data (FR51 skip optimization)
3. Call FMP service functions
4. Write results to market_data table via Drizzle
5. Call `revalidatePath('/', 'layout')`
6. Return `ActionResult`

### Database: market_data Table (Already Exists)

```typescript
// src/server/db/schema.ts — already defined, DO NOT modify
export const marketData = sqliteTable("market_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),           // e.g., "AAPL" or "GBPUSD"
  type: text("type").$type<"stock_price" | "fx_rate">().notNull(),
  date: text("date").notNull(),               // ISO date: "2026-04-07"
  value: real("value").notNull(),             // price or FX rate
  fetchedAt: text("fetched_at").notNull(),    // ISO timestamp: "2026-04-07T16:00:00Z"
}, (table) => [
  index("market_data_symbol_type_date_idx").on(table.symbol, table.type, table.date),
]);
```

**Write pattern:** For each fetched price/rate, INSERT a new row. Historical entries are NEVER overwritten — this is a growing time-series (not a cache). Use `date-fns` `formatISO(new Date())` for `fetchedAt` (exception: `new Date()` is acceptable for fetched_at timestamps since it marks "when fetched", not a business date).

**FR51 skip optimization:** Before calling FMP, query market_data for rows matching today's date + the relevant symbols. Skip any symbols that already have today's data. This avoids redundant API calls on repeated refreshes.

### Existing Types to Use (DO NOT Recreate)

```typescript
// src/server/types/action-result.ts — already exists
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };

// src/server/types/positions.ts — already exists, consumed by computation engine
export interface MarketDataInput { symbol: string; date: string; value: number; }
export interface FxRateInput { symbol: string; date: string; value: number; }
```

The `MarketDataInput` and `FxRateInput` types are consumed by `computePositions()` in `src/server/services/computation.ts`. The market_data table rows map directly to these interfaces.

### Server Action Pattern (Established in Architecture)

```typescript
'use server'

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/server/types/action-result';

export async function refreshPrices(): Promise<ActionResult<{ updated: number }>> {
  // 1. Query unique tickers from transactions table
  // 2. Check which tickers already have today's data in market_data
  // 3. Call fetchStockPrices() for tickers needing refresh
  // 4. Write results to market_data table
  // 5. revalidatePath('/', 'layout')
  // 6. Return ActionResult with count of updated prices
}
```

**CRITICAL:** Server Actions never throw — wrap everything in try/catch internally and return `{ success: false, error: "descriptive message" }` on failure. Never expose raw FMP API error messages to the client.

### better-sqlite3 Is Synchronous

All Drizzle queries use `.get()` / `.all()` — they return immediately. Do NOT `await` Drizzle queries with better-sqlite3. The Server Actions themselves are `async` (required by Next.js and for the `fetch` calls to FMP), but DB operations within them are synchronous.

```typescript
// CORRECT
const rows = db.select().from(transactions).all();

// WRONG — do not await synchronous operations
const rows = await db.select().from(transactions).all();
```

### Date Handling

- Use `date-fns` for all date operations: `format`, `parseISO`, `startOfDay`, `isToday`
- The `date` column in market_data stores ISO date strings: `"2026-04-07"`
- Use `format(new Date(), 'yyyy-MM-dd')` for today's date (this is the ONE acceptable use of `new Date()` — for "current moment" timestamps, not business dates)
- `fetchedAt` stores full ISO timestamp: `new Date().toISOString()`

### Currency Pair Convention

FMP expects currency pairs as `{FROM}{TO}` with no separator: `GBPUSD`, `EURUSD`. The seed data uses currencies like `"GBP"`, `"EUR"`, `"USD"`. To build the FMP symbol:
- Filter out `"USD"` (no FX conversion needed)
- Append `"USD"` to each remaining currency: `"GBP"` → `"GBPUSD"`
- The rate returned is "multiply native currency by this to get USD" (matches `FxRateInput.value` convention)

### Error Handling Strategy

FMP service functions should:
- Use `try/catch` around `fetch()` calls
- Check `response.ok` before parsing JSON
- Return empty array on any error (let the caller decide how to handle)
- Optionally throw with descriptive message for total failure

Server Actions should:
- Catch ALL errors from FMP service
- Return `{ success: false, error: "Unable to fetch stock prices. Please try again." }` — user-friendly message
- Never expose raw HTTP status codes, FMP error messages, or stack traces
- On partial success (some tickers succeeded, some failed): write what succeeded, return success with a note about partial results

### File Structure

```
src/server/
├── actions/
│   └── market-data.ts      # NEW: refreshPrices(), refreshFxRates()
├── queries/
│   ├── transactions.ts      # EXISTS: getTransactionCount()
│   └── market-data.ts       # NEW: getLatestFetchTimestamp(), getTodayMarketData()
├── services/
│   ├── computation.ts       # EXISTS: DO NOT MODIFY
│   ├── computation.test.ts  # EXISTS: DO NOT MODIFY
│   ├── fmp.ts               # NEW: fetchStockPrices(), fetchFxRates()
│   └── fmp.test.ts          # NEW: unit tests
├── types/
│   ├── action-result.ts     # EXISTS: DO NOT MODIFY
│   ├── positions.ts         # EXISTS: DO NOT MODIFY
│   └── market-data.ts       # NEW: FmpQuote, FmpFxQuote, RefreshResult types
├── config.ts                # EXISTS: already has fmpApiKey
└── db/
    ├── schema.ts            # EXISTS: already has marketData table — DO NOT MODIFY
    └── ...
```

### What NOT to Build in This Story

- No UI components (no refresh button, no price timestamp, no loading states)
- No dashboard query functions (Story 2.2)
- No portfolio selector (Story 2.3)
- No modifications to the computation engine
- No client-side code at all — this is entirely server-side

### Project Structure Notes

- All new files follow established `kebab-case` naming convention
- Services are pure functions — no DB imports, receive data as args
- Actions orchestrate: query → check → call service → write → revalidate → return
- Queries are read-only DB access functions
- Types are in `src/server/types/` — importable by both server code and shared schemas
- Tests co-located with source: `fmp.test.ts` next to `fmp.ts`

### Previous Story Intelligence (from Story 1.4)

- **Next.js 16.2.2 async searchParams:** Not directly relevant to this story (no page components), but be aware that `searchParams` is `Promise<{...}>` and must be awaited — architecture doc examples are outdated
- **better-sqlite3 sync:** Drizzle queries use `.get()` / `.all()`, never `await`. Established in Stories 1.1-1.4
- **Formatting null safety:** All formatter functions accept `null` → `"N/A"`. This story's market data feeds into those formatters via the computation engine
- **Test co-location:** Tests live next to source files (e.g., `fmp.test.ts`), NOT in `__tests__/` subdirectories. Story 1.4 deleted the old `__tests__/` pattern
- **ActionResult pattern:** Already defined in `src/server/types/action-result.ts`. Discriminated union: `{ success: true; data: T } | { success: false; error: string }`

### Git Intelligence (Recent Patterns)

- Feature commits: `feat: story X.Y — description`
- Review fix commits: `fix: code review fixes for story X.Y — specifics`
- Story creation commits: `chore: create story X.Y — description`
- All co-authored with Claude

### Testing Approach

**Unit test `fmp.test.ts` by mocking `global.fetch`:**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchStockPrices, fetchFxRates } from './fmp';

beforeEach(() => {
  vi.restoreAllMocks();
});

it('fetches stock prices for given tickers', async () => {
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify([{ symbol: 'AAPL', price: 258.86 }]), { status: 200 })
  );
  const result = await fetchStockPrices(['AAPL']);
  expect(result).toEqual([{ symbol: 'AAPL', price: 258.86 }]);
});
```

Test scenarios:
- Successful single and multiple ticker fetches
- Successful FX rate fetches
- Network failure (fetch rejects)
- Non-200 HTTP response
- Invalid JSON response
- Empty ticker/currency arrays (should return [] immediately, no API call)
- API key is empty string (should return error, not call FMP)

**Do NOT test Server Actions in unit tests** — they require Next.js runtime. Server Actions will be tested via E2E tests in later stories.

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow, FMP Integration, Architectural Boundaries, Server Action Pattern]
- [Source: _bmad-output/planning-artifacts/prd.md — FR48, FR49, FR50, FR51, FR52]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Error states, graceful degradation]
- [Source: src/server/db/schema.ts — marketData table definition]
- [Source: src/server/types/action-result.ts — ActionResult type]
- [Source: src/server/types/positions.ts — MarketDataInput, FxRateInput]
- [Source: src/server/config.ts — config.fmpApiKey]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Fixed lint warning: removed unused `fxPairs` variable in market-data action
- Fixed lint warning: removed unused `inArray` import in market-data query
- Replaced empty-API-key unit test (ESM module caching prevents `vi.doMock` re-import) with purity assertion test

### Completion Notes List

- **Task 4:** Created `src/server/types/market-data.ts` with `FmpQuote`, `FmpFxQuote`, and `RefreshResult` interfaces
- **Task 1:** Created `src/server/services/fmp.ts` — pure service with `fetchStockPrices()` and `fetchFxRates()`, parallel fetching via `Promise.all()`, individual `quote-short`/`forex-quote-short` calls per ticker/pair, graceful error handling returning empty arrays
- **Task 3:** Created `src/server/queries/market-data.ts` with `getExistingSymbolsForDate()` for FR51 skip optimization and `getLatestFetchTimestamp()` for Story 2.3
- **Task 2:** Created `src/server/actions/market-data.ts` with `refreshPrices()` and `refreshFxRates()` Server Actions following the orchestration pattern: query transactions → check today's data → call FMP → write to market_data → revalidatePath → return ActionResult
- **Task 5:** Created `src/server/services/fmp.test.ts` with 14 tests covering: single/multi ticker fetches, FX rate fetches, network failures, non-200 responses, invalid JSON, non-array responses, partial failures, empty inputs, and purity assertion

All 79 tests pass (6 test files). Zero lint errors/warnings.

### Change Log

- Story 2.1 implementation complete — FMP service layer, market data Server Actions, query helpers, types, and unit tests (Date: 2026-04-07)

### File List

- `src/server/types/market-data.ts` (NEW)
- `src/server/services/fmp.ts` (NEW)
- `src/server/services/fmp.test.ts` (NEW)
- `src/server/queries/market-data.ts` (NEW)
- `src/server/actions/market-data.ts` (NEW)
