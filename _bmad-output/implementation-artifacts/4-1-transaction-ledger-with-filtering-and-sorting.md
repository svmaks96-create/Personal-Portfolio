# Story 4.1: Transaction Ledger with Filtering and Sorting

Status: done

## Story

As a user,
I want to view my complete transaction history with the ability to filter by portfolio and ticker and sort by any column,
So that I can find and review any transaction quickly.

## Acceptance Criteria

1. **Given** transactions exist in the database **When** I navigate to the Transactions page **Then** I see a TanStack Table with columns: Date, Ticker, Action, Quantity, Price, Fees, Portfolio, Currency **And** all transactions are displayed with proper formatting (dates as "MMM d, yyyy", currency with $ prefix and 2dp, quantities with 1dp, right-aligned numerics, tabular figures) **And** table row height is 40px (FR11, UX-DR7)

2. **Given** the transactions table is loaded **When** no sort has been applied **Then** transactions are sorted by date descending by default (UX-DR7)

3. **Given** the transactions table is displayed **When** I click any column header **Then** the table sorts ascending (first click), descending (second click), removes sort (third click) **And** a small arrow indicator appears next to the sorted column header text (FR14, UX-DR22)

4. **Given** a `?portfolio=` URL parameter is present **When** the Transactions page loads **Then** the table shows only transactions belonging to that portfolio (FR12)

5. **Given** a `?ticker=` URL parameter is present **When** the Transactions page loads **Then** the table shows only transactions for that ticker (FR13)

6. **Given** both `?portfolio=` and `?ticker=` URL parameters are present (e.g., from position drill-down) **When** the Transactions page loads **Then** the table is filtered by both portfolio and ticker simultaneously

7. **Given** one or more filters are active **When** the filter display area renders **Then** I see text "Filtered by: [ticker] · [portfolio]" (one or both depending on active filters) **And** a "Clear" link removes all filters and reloads the full transaction list (UX-DR23)

8. **Given** no transactions match the current filters **When** the Transactions page renders **Then** I see an empty state: "No transactions for [ticker] in [portfolio]" with a "Clear filters" link (UX-DR14)

9. **Given** the Transactions page receives `searchParams` from the URL **When** the page component reads filter values **Then** it reads from the `searchParams` prop (Server Component), NOT from `useSearchParams()` hook

## Tasks / Subtasks

- [x] Task 1: Create `getTransactions()` query (AC: #1, #4, #5, #6)
  - [x] 1.1 Define `TransactionRow` interface with `{ value, display }` pairs for formatted fields
  - [x] 1.2 Implement query with optional `portfolio` and `ticker` filters using Drizzle `where` + `and`/`eq`
  - [x] 1.3 Format all fields using `formatting.ts` functions before returning
  - [x] 1.4 Write unit tests: unfiltered, portfolio-filtered, ticker-filtered, both filters, empty result

- [x] Task 2: Create `transactions-columns.tsx` column definitions (AC: #1, #3)
  - [x] 2.1 Define 8 columns matching schema: Date, Ticker, Action, Quantity, Price, Fees, Portfolio, Currency
  - [x] 2.2 Use `accessorFn` for numeric columns to enable proper sorting
  - [x] 2.3 Use `NumericCell` pattern for tabular-nums on Quantity, Price, Fees
  - [x] 2.4 Use `formatDate` display for Date column

- [x] Task 3: Create `TransactionsTable` client component (AC: #1, #2, #3)
  - [x] 3.1 Reuse the existing `PositionsTable` pattern OR create a dedicated `TransactionsTable` if the shape differs enough (no onRowClick, no invalid state)
  - [x] 3.2 Default sort: `[{ id: "date", desc: true }]`
  - [x] 3.3 40px row height, standard table styling matching positions tables

- [x] Task 4: Create active filter display component (AC: #7)
  - [x] 4.1 Show "Filtered by: [ticker] · [portfolio]" text when filters active
  - [x] 4.2 "Clear" link navigates to `/transactions` (removes all query params)

- [x] Task 5: Update `transactions/page.tsx` Server Component (AC: #4, #5, #6, #8, #9)
  - [x] 5.1 Accept `searchParams` prop (Promise pattern matching positions page)
  - [x] 5.2 Extract `portfolio` and `ticker` from searchParams
  - [x] 5.3 Call `getTransactions(portfolioFilter, tickerFilter)`
  - [x] 5.4 Render ControlsBar + filter display + TransactionsTable
  - [x] 5.5 Handle empty state with contextual message

- [x] Task 6: Lint and test (AC: all)
  - [x] 6.1 Run `npm run lint` — zero errors
  - [x] 6.2 Run `npm run test:run` — all tests pass

## Dev Notes

### Architecture & Data Flow

This story follows the established read path:
```
Server Component (page.tsx) → Query (getTransactions) → Drizzle → Format → Domain Component
```

**No Server Actions needed** — this story is read-only (filtering/sorting). Inline editing is Story 4.2.

### Existing Patterns to Follow

**Query pattern** — Follow `src/server/queries/positions.ts`:
- Query returns typed rows with `{ value: number | null, display: string }` for each formatted field
- Formatting happens in the query, not in components
- Use `formatDate()`, `formatCurrency()`, `formatShares()` from `src/lib/formatting.ts`

**Column definitions** — Follow `src/components/domain/positions-columns.tsx`:
- `accessorFn` extracts `.value` for sorting; cell renders `.display`
- `sortUndefined: "last"` for nullable fields
- `NumericCell` component wraps numeric displays in `tabular-nums`
- `meta: { align: "center" as const }` for column alignment

**Table component** — Follow `src/components/domain/positions-table.tsx`:
- Generic `PositionsTable<TData>` accepts columns, defaultSort, emptyMessage
- Consider reusing directly since interface is generic, OR create `TransactionsTable` if needed
- The table already handles sorting state, header click toggling, sort indicators

**Page pattern** — Follow `src/app/positions/page.tsx`:
- `searchParams` is typed as `Promise<{ [key: string]: string | string[] | undefined }>`
- Await and destructure: `const { portfolio, ticker } = await searchParams`
- Cast to string: `typeof portfolio === "string" ? portfolio : undefined`
- Early return with `EmptyState` if `getTransactionCount() === 0`

### TransactionRow Interface

Define in `src/server/queries/transactions.ts`:

```typescript
export interface TransactionRow {
  id: number;
  date: { value: string; display: string };       // ISO string for sort, "MMM d, yyyy" for display
  ticker: string;                                   // Plain string, no formatting needed
  action: string;                                   // "buy" | "sell" | "dividend" | "fee"
  quantity: { value: number; display: string };     // Raw number for sort, formatted 1dp for display
  price: { value: number; display: string };        // Raw number for sort, $X,XXX.XX for display
  fees: { value: number; display: string };         // Raw number for sort, $X,XXX.XX for display
  portfolio: string;                                // Plain string
  currency: string;                                 // 3-letter code
}
```

### Query Implementation

```typescript
// In src/server/queries/transactions.ts
import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { formatDate, formatCurrency, formatShares } from "@/lib/formatting";

export function getTransactions(portfolio?: string, ticker?: string): TransactionRow[] {
  const conditions = [];
  if (portfolio) conditions.push(eq(transactions.portfolio, portfolio));
  if (ticker) conditions.push(eq(transactions.ticker, ticker));

  const rows = db
    .select()
    .from(transactions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(transactions.date))
    .all();

  return rows.map((row) => ({
    id: row.id,
    date: { value: row.date, display: formatDate(row.date) },
    ticker: row.ticker,
    action: row.action,
    quantity: { value: row.quantity, display: formatShares(row.quantity) },
    price: { value: row.price, display: formatCurrency(row.price) },
    fees: { value: row.fees, display: formatCurrency(row.fees) },
    portfolio: row.portfolio,
    currency: row.currency,
  }));
}
```

### Filter Display Component

Create `src/components/domain/active-filters.tsx` — a simple server-rendered component:
- Receives `ticker?: string` and `portfolio?: string` props
- Renders "Filtered by: {ticker} · {portfolio}" with a "Clear" link to `/transactions`
- If no filters active, renders nothing
- Use Next.js `Link` for the "Clear" navigation

### Empty State Messages

Build contextual messages:
- Both filters: `No transactions for ${ticker} in ${portfolio}`
- Ticker only: `No transactions for ${ticker}`
- Portfolio only: `No transactions in ${portfolio}`
- No filters: `No transactions yet`

### Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/server/queries/transactions.ts` | Modify | Add `TransactionRow` interface and `getTransactions()` query |
| `src/server/queries/transactions.test.ts` | Create | Unit tests for getTransactions with filter combinations |
| `src/components/domain/transactions-columns.tsx` | Create | Column definitions for TanStack Table |
| `src/components/domain/active-filters.tsx` | Create | Filter display with "Clear" link |
| `src/app/transactions/page.tsx` | Modify | Full page implementation with searchParams, ControlsBar, table |

### Project Structure Notes

- All new files follow `kebab-case` naming
- Query file already exists at `src/server/queries/transactions.ts` — extend it
- Column definitions go in `src/components/domain/` alongside existing `positions-columns.tsx`
- Page already exists at `src/app/transactions/page.tsx` — rewrite the stub
- No new Zod schemas needed for this read-only story (schemas come in Story 4.2 for editing)

### Testing Strategy

Follow pattern from `src/server/queries/positions.test.ts`:
- Test against seeded SQLite database
- Test cases: all transactions (unfiltered), filtered by portfolio, filtered by ticker, filtered by both, empty result
- Verify formatting is applied (e.g., date displays as "MMM d, yyyy")
- Verify row count matches expected seed data

### Anti-Patterns to Avoid

- DO NOT use `useSearchParams()` hook — use `searchParams` page prop
- DO NOT format numbers in components — formatting happens in query
- DO NOT import `decimal.js` in client code — not needed for read-only display
- DO NOT create API route files — no Server Actions needed for this story
- DO NOT create barrel files (index.ts re-exports)
- DO NOT add inline editing — that is Story 4.2
- DO NOT add row selection/checkboxes — that is Story 6.2
- DO NOT add "Add Transaction" button — that is Story 6.1
- DO NOT duplicate table component logic — reuse `PositionsTable` if compatible

### Previous Story Intelligence (Story 3.2)

Key learnings from Story 3.2 that apply here:
- **`{ value, display }` pattern works well** — established for all numeric columns, reuse for transactions
- **`encodeURIComponent` on URL params** — already handled in drill-down, transactions page must `decodeURIComponent` if needed (URL params are auto-decoded by Next.js)
- **`PositionsTable` is already generic** — accepts any `TData` with configurable columns, defaultSort, emptyMessage. Can likely reuse directly for transactions
- **`NumericCell` component** exists in positions-columns.tsx — either import from there or co-locate in transactions-columns.tsx
- **Tests pattern**: import from queries file, call functions directly, assert on row structure
- **Code review fixes from 3.2**: URL encoding, type safety with `in` guard, `cn()` for conditional classes — follow these patterns

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.1]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow, Query Patterns, TanStack Table]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR7, UX-DR22, UX-DR23, UX-DR14]
- [Source: _bmad-output/planning-artifacts/prd.md — FR11, FR12, FR13, FR14]
- [Source: src/server/queries/positions.ts — Query pattern reference]
- [Source: src/components/domain/positions-columns.tsx — Column definition pattern]
- [Source: src/components/domain/positions-table.tsx — Generic table component]
- [Source: src/app/positions/page.tsx — Page pattern with searchParams]
- [Source: src/lib/formatting.ts — formatDate, formatCurrency, formatShares]

### Review Findings

- [x] [Review][Decision] Column set deviates from AC1 spec — RESOLVED: spec updated to match implementation. Columns are now Date, Ticker, Action, Quantity, Gross Amount, Fees, Net Amount, Net Avg Price, Portfolio, Currency (reflects price→grossAmount refactor).
- [x] [Review][Patch] Numeric columns center-aligned instead of right-aligned — DISMISSED: user accepts center alignment, spec updated to match implementation
- [x] [Review][Patch] Financial math uses JS number instead of decimal.js [src/server/queries/transactions.ts:25-58] — FIXED: `computeNetAmount` and `netAvgPrice` now use `decimal.js`
- [x] [Review][Patch] PortfolioSelector drops ticker filter when changing portfolio [src/components/domain/portfolio-selector.tsx] — FIXED: now preserves existing search params via `useSearchParams()`
- [x] [Review][Patch] Same-date transactions have no stable sort tiebreaker [src/server/queries/transactions.ts:50] — FIXED: added `desc(transactions.id)` as secondary sort
- [x] [Review][Defer] Withholding tax dividend rows have no visual distinction from income dividends — deferred, UX enhancement beyond story scope

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no blockers.

### Completion Notes List

- Task 1: Implemented `TransactionRow` interface and `getTransactions()` query with optional portfolio/ticker filters using Drizzle `where` + `and`/`eq`. All fields formatted via `formatting.ts`. 8 unit tests covering unfiltered, filtered, both filters, multiple rows, and zero fees.
- Task 2: Created 8 TanStack Table column definitions with `accessorFn` for numeric/date sorting, `NumericCell` for tabular-nums, and capitalize on Action column.
- Task 3: Reused existing generic `PositionsTable<TData>` directly — no dedicated TransactionsTable needed. The generic component already handles sorting state, header click toggling, sort indicators, 40px row height, and empty states.
- Task 4: Created `ActiveFilters` server component showing "Filtered by: [ticker] · [portfolio]" with a "Clear" link to `/transactions`. Returns null when no filters active.
- Task 5: Rewrote transactions page as async Server Component with `searchParams` Promise pattern. Reads portfolio + ticker filters, calls `getTransactions()`, renders ControlsBar + ActiveFilters + PositionsTable with contextual empty states.
- Task 6: Lint passes with zero errors (only pre-existing TanStack Table warning). All 111 tests pass including 8 new transaction query tests.

### Change Log

- 2026-04-07: Story 4.1 implementation complete — transaction ledger with filtering and sorting

### File List

- `src/server/queries/transactions.ts` — Modified: added `TransactionRow` interface and `getTransactions()` query
- `src/server/queries/transactions.test.ts` — Created: unit tests for getTransactions with filter combinations
- `src/components/domain/transactions-columns.tsx` — Created: 8 TanStack Table column definitions
- `src/components/domain/active-filters.tsx` — Created: filter display component with Clear link
- `src/app/transactions/page.tsx` — Modified: full page with searchParams, ControlsBar, filters, table, empty states
