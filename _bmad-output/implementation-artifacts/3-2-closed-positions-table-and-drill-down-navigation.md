# Story 3.2: Closed Positions Table & Drill-Down Navigation

Status: review

## Story

As a user,
I want to see my closed positions with realized P&L and click any position to see its underlying transactions,
So that I can review past investments and audit any position's numbers.

## Acceptance Criteria

1. **Given** closed positions exist (shares held = 0, fully divested), **When** I view the Positions page, **Then** I see a separate table below the active positions table with columns: Ticker, Portfolio, Avg Entry, Last Price, Total Invested, Total Proceeds, Dividends (net), Realized P&L. **And** the closed positions table has the same formatting rules as the active table (currency 2dp, right-aligned, P&L coloring, tabular figures, 40px row height). **And** section spacing between active and closed tables is 32px. (FR7, UX-DR6, UX-DR24)

2. **Given** a `?portfolio=` URL parameter is present, **When** the closed positions table renders, **Then** only closed positions belonging to that portfolio are shown. (FR8)

3. **Given** the closed positions table is displayed, **When** I click any column header, **Then** the table sorts by that column using the same ascending/descending/clear cycle as the active table. (FR9, UX-DR22)

4. **Given** any position row in either the active or closed positions table, **When** I hover over the row, **Then** the cursor changes to pointer and the row background changes to `zinc-100`. (UX-DR25)

5. **Given** I click a position row (active or closed), **When** the click event fires, **Then** I am navigated to `/transactions?ticker=[ticker]&portfolio=[portfolio]`. **And** the Transactions page loads with those filters pre-applied. (FR10, UX-DR25)

6. **Given** no closed positions exist (or none match the current portfolio filter), **When** the Positions page loads, **Then** the closed positions section is simply not rendered (no empty state needed — the section heading and table are absent).

## Tasks / Subtasks

- [x] Task 1: Query function for closed positions (AC: 1, 2)
  - [x] 1.1 Add `getClosedPositions(portfolio?: string)` to `src/server/queries/positions.ts` — follows `getActivePositions()` pattern: share data fetching, filter to `isClosed` positions, map to `ClosedPositionRow[]`
  - [x] 1.2 Extract shared data-fetching logic from `getActivePositions()` into a private helper (e.g., `fetchPositionData(portfolio?)`) to avoid duplicating DB queries between active and closed functions
  - [x] 1.3 Define `ClosedPositionRow` interface: `ticker`, `portfolio`, `avgEntry`, `lastPrice`, `totalInvested`, `totalProceeds`, `dividends`, `realizedPnl` — all numeric fields as `{ value: number | null, display: string }`
  - [x] 1.4 Unit test `getClosedPositions()` — empty returns `[]`, includes only closed positions, filters by portfolio, formats correctly

- [x] Task 2: Closed positions column definitions (AC: 1, 3)
  - [x] 2.1 Create `closedPositionsColumns` in `src/components/domain/positions-columns.tsx` — export `ColumnDef<ClosedPositionRow>[]` with 8 columns
  - [x] 2.2 Follow same pattern as `activePositionsColumns`: `accessorFn` for raw value sorting, cell renders display string, `sortUndefined: "last"` on nullable columns, P&L coloring, `tabular-nums`, right-aligned numerics
  - [x] 2.3 Default sort: `realizedPnl` descending (most profitable closed positions first)

- [x] Task 3: Add drill-down navigation to PositionsTable (AC: 4, 5)
  - [x] 3.1 Add `onRowClick?: (ticker: string, portfolio: string) => void` callback prop to `PositionsTable`
  - [x] 3.2 When `onRowClick` is provided: apply `cursor-pointer` on rows, `hover:bg-zinc-100` on non-invalid rows, call `onRowClick(ticker, portfolio)` on row click
  - [x] 3.3 Create a thin client wrapper (e.g., `ClickablePositionsTable`) that uses `useRouter()` from `next/navigation` to handle `onRowClick` by navigating to `/transactions?ticker=${ticker}&portfolio=${portfolio}`
  - [x] 3.4 Both active and closed tables use the same drill-down wrapper

- [x] Task 4: Closed positions table rendering (AC: 1, 6)
  - [x] 4.1 Update `PositionsTable` to accept generic column definitions (not hardcoded to `activePositionsColumns`) — make it accept `columns` prop so both active and closed tables reuse the same table component
  - [x] 4.2 The closed positions section includes a section heading "Closed Positions" (text-[16px] font-semibold text-zinc-900) above the table
  - [x] 4.3 If no closed positions, the entire section (heading + table) is not rendered

- [x] Task 5: Page integration (AC: 1, 2, 4, 5, 6)
  - [x] 5.1 Update `src/app/positions/page.tsx` — call both `getActivePositions()` and `getClosedPositions()` with the portfolio filter
  - [x] 5.2 Render active positions table, then 32px spacing (`space-y-8`), then closed positions section (only if closed positions exist)
  - [x] 5.3 Both tables wrapped in drill-down client wrapper for row click navigation

- [x] Task 6: Tests (all ACs)
  - [x] 6.1 Unit test `getClosedPositions()` — returns formatted data, filters by portfolio, includes only closed positions
  - [x] 6.2 Verify all existing tests still pass (`npm run test:run`)
  - [x] 6.3 Run lint (`npm run lint`)

## Dev Notes

### Architecture & Data Flow

**Read path for closed positions (same page, parallel queries):**
```
positions/page.tsx (Server Component)
  → await searchParams → extract portfolio filter
  → getActivePositions(portfolio?) → ActivePositionRow[]
  → getClosedPositions(portfolio?) → ClosedPositionRow[]
  → Pass both to respective table components (client)
  → Drill-down: client onClick → router.push('/transactions?ticker=X&portfolio=Y')
```

### Data Shape for Closed Positions Table

Per FR7 and UX-DR6, closed positions have **8 columns** (fewer than active's 11 — no Shares, no Weight%, no Cost Basis, no Market Value; adds Total Invested, Total Proceeds):

```typescript
// Add to src/server/queries/positions.ts
export interface ClosedPositionRow {
  ticker: string;
  portfolio: string;
  avgEntry: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  totalInvested: { value: number | null; display: string };
  totalProceeds: { value: number | null; display: string };
  dividends: { value: number | null; display: string };
  realizedPnl: { value: number | null; display: string };
}
```

**Formatting mapping** (reuse existing formatters from `src/lib/formatting.ts`):
- `avgEntry` → `formatCurrency(position.avgEntryPrice)`
- `lastPrice` → `formatCurrency(position.lastPrice)`
- `totalInvested` → `formatCurrency(position.totalInvested)`
- `totalProceeds` → `formatCurrency(position.totalSellProceeds)`
- `dividends` → `formatCurrency(position.totalDividends)`
- `realizedPnl` → `formatPnL(position.totalPnl)`

**Note:** For closed positions, `computePositions()` already sets `marketValue = 0` and computes `totalPnl` as fully realized (`totalSellProceeds + totalDividends - totalInvested`). No special computation needed.

### Shared Data Fetching — Extract Helper

Currently `getActivePositions()` (lines ~30-80 of `src/server/queries/positions.ts`) fetches transactions, prices, and FX rates then calls `computePositions()`. The new `getClosedPositions()` needs the same data. **Extract the shared fetching + computation into a private helper:**

```typescript
// Private helper — not exported
function computeAllPositions(portfolio?: string): ComputedPosition[] {
  // 1. Fetch transactions (filtered by portfolio if provided)
  // 2. Build priceMap from latest stock prices
  // 3. Fetch FX rates
  // 4. Return computePositions(txInputs, priceMap, fxRates)
}

export function getActivePositions(portfolio?: string): ActivePositionRow[] {
  const positions = computeAllPositions(portfolio);
  const active = positions.filter((p) => !p.isClosed);
  const aggregates = computeAggregates(active);
  return aggregates.positions.map(/* ... ActivePositionRow mapping */);
}

export function getClosedPositions(portfolio?: string): ClosedPositionRow[] {
  const positions = computeAllPositions(portfolio);
  const closed = positions.filter((p) => p.isClosed);
  return closed.map(/* ... ClosedPositionRow mapping */);
}
```

**Important:** `getClosedPositions` does NOT need `computeAggregates()` — closed positions have no weight% calculation. Map directly from `ComputedPosition`.

**Note on page-level optimization:** The positions page calls both `getActivePositions()` and `getClosedPositions()`, which means `computeAllPositions()` runs twice. Since better-sqlite3 is synchronous and the dataset is small (single user), this is acceptable. If needed later, a combined function could return both in one pass, but don't prematurely optimize.

### Generalize PositionsTable Component

Currently `PositionsTable` hardcodes `activePositionsColumns`. Generalize it to accept `columns` as a prop so both active and closed tables reuse it:

```typescript
interface PositionsTableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  defaultSort: SortingState;
  emptyMessage?: string;
  onRowClick?: (row: TData) => void;
}
```

- Active table: `columns={activePositionsColumns}`, `defaultSort={[{ id: "marketValue", desc: true }]}`
- Closed table: `columns={closedPositionsColumns}`, `defaultSort={[{ id: "realizedPnl", desc: true }]}`

### Drill-Down Navigation Pattern

Per UX-DR25 and FR10, clicking a position row navigates to `/transactions?ticker=[ticker]&portfolio=[portfolio]`.

**Implementation approach:** The `PositionsTable` is a `'use client'` component so it can use `useRouter()` directly. Add an `onRowClick` callback:

```typescript
// In PositionsTable component:
const router = useRouter();

// On <TableRow>:
<TableRow
  onClick={() => onRowClick?.(row.original)}
  className={cn(
    "h-10 border-b border-zinc-100",
    onRowClick && "cursor-pointer hover:bg-zinc-100",
    // keep amber for invalid state rows
    row.original.hasInvalidState && "bg-amber-50"
  )}
>
```

The page passes the click handler:

```typescript
// For active positions (has ticker + portfolio on row):
onRowClick={(row) => router.push(`/transactions?ticker=${row.ticker}&portfolio=${encodeURIComponent(row.portfolio)}`)}

// For closed positions (same fields available):
onRowClick={(row) => router.push(`/transactions?ticker=${row.ticker}&portfolio=${encodeURIComponent(row.portfolio)}`)}
```

**Important:** `encodeURIComponent` on portfolio name — portfolio names like "Interactive Brokers" have spaces.

Since `PositionsTable` already uses `'use client'`, the `useRouter()` + `onClick` can live directly in the table component. No need for a separate wrapper — just import `useRouter` from `next/navigation` and add the click handler.

### Row Hover Styling

Per UX-DR25: `cursor-pointer` and `hover:bg-zinc-100` on position rows. Current `PositionsTable` does NOT have hover styling. Add it:
- Normal rows: `hover:bg-zinc-100 cursor-pointer`
- Invalid state rows: already `bg-amber-50`, hover should still show pointer cursor but keep amber background: `hover:bg-amber-100 cursor-pointer`

### Closed Positions Section Layout

```
┌─────────────────────────────────────────────────────────────┐
│ [All Portfolios ▾]  [↻ Refresh]  Prices as of Apr 2 close  │ ← ControlsBar
│                                                              │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Ticker │ Portfolio │ Shares │ ... │ P&L │ Weight%        ││ ← Active Table
│ ├───────────────────────────────────────────────────────────┤│
│ │ AAPL   │ IB       │  50.0  │ ... │      │               ││
│ └───────────────────────────────────────────────────────────┘│
│                                                              │ ← 32px gap (space-y-8)
│ Closed Positions                                             │ ← Section heading
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Ticker │ Portfolio │ Avg Entry │ Last Price │ ... │ P&L  ││ ← Closed Table
│ ├───────────────────────────────────────────────────────────┤│
│ │ TSLA   │ Schwab   │  $215.00  │   $180.00  │ ... │      ││
│ └───────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

- The `space-y-8` class on the parent div already provides 32px spacing between sections
- Closed positions section only renders if `closedPositions.length > 0`
- No empty state for closed positions — just don't render the section

### Column Definitions for Closed Positions

```typescript
export const closedPositionsColumns: ColumnDef<ClosedPositionRow>[] = [
  { accessorKey: "ticker", header: "Ticker", cell: ... font-medium },
  { accessorKey: "portfolio", header: "Portfolio" },
  { accessorKey: "avgEntry", header: "Avg Entry", accessorFn: row => row.avgEntry.value ?? undefined, sortUndefined: "last", cell: ... NumericCell },
  { accessorKey: "lastPrice", header: "Last Price", accessorFn: row => row.lastPrice.value ?? undefined, sortUndefined: "last", cell: ... NumericCell },
  { accessorKey: "totalInvested", header: "Total Invested", accessorFn: row => row.totalInvested.value ?? undefined, sortUndefined: "last", cell: ... NumericCell },
  { accessorKey: "totalProceeds", header: "Total Proceeds", accessorFn: row => row.totalProceeds.value ?? undefined, sortUndefined: "last", cell: ... NumericCell },
  { accessorKey: "dividends", header: "Dividends", accessorFn: row => row.dividends.value ?? undefined, sortUndefined: "last", cell: ... NumericCell },
  { accessorKey: "realizedPnl", header: "Realized P&L", accessorFn: row => row.realizedPnl.value ?? undefined, sortUndefined: "last", cell: ... P&L coloring },
];
```

### Key Existing Code to Reuse

| What | Where | Notes |
|------|-------|-------|
| `getActivePositions()` | `src/server/queries/positions.ts` | Pattern to follow; extract shared data fetching |
| `ActivePositionRow` interface | `src/server/queries/positions.ts` | Reference for `{ value, display }` pattern |
| `activePositionsColumns` | `src/components/domain/positions-columns.tsx` | Pattern for closed columns; `NumericCell` helper |
| `PositionsTable` | `src/components/domain/positions-table.tsx` | Generalize to accept `columns` prop |
| `computePositions()` | `src/server/services/computation.ts` | Already handles closed positions (`isClosed`, `marketValue=0`, realized P&L) |
| `formatCurrency()`, `formatPnL()` | `src/lib/formatting.ts` | All formatters ready |
| `EmptyState` | `src/components/domain/empty-state.tsx` | For active positions empty state (closed section just hides) |
| `ControlsBar` | `src/components/domain/controls-bar.tsx` | Already on positions page |

### Anti-Patterns to Avoid

- DO NOT duplicate data-fetching logic — extract shared helper from `getActivePositions`
- DO NOT create a separate table component for closed positions — generalize `PositionsTable`
- DO NOT add drill-down to the page component — it belongs in the table (client component with `useRouter`)
- DO NOT format numbers in components — use `src/lib/formatting.ts` in the query function
- DO NOT use `useSearchParams()` in `page.tsx` — use `searchParams` prop (already correct)
- DO NOT import `decimal.js` in client code
- DO NOT forget `encodeURIComponent` on portfolio name in drill-down URL
- DO NOT show empty state for closed positions — just hide the section
- DO NOT call `computeAggregates()` for closed positions — no weight% needed

### Previous Story Intelligence

**From Story 3.1 (direct predecessor):**
- `PositionsTable` currently hardcodes `activePositionsColumns` — must be generalized
- `NumericCell` helper component already exists in `positions-columns.tsx` — reuse for closed columns
- P&L coloring: neutral (no color) for zero, `text-emerald-600` for positive, `text-red-600` for negative — already established
- `sortUndefined: "last"` with `?? undefined` on all nullable `accessorFn` values — follow same pattern
- Column alignment uses `meta: { align: "center" }` — continue same pattern
- Invalid state rows: `bg-amber-50` with `TriangleAlert` icon — only applies to active positions (closed positions can't have invalid state since `sharesHeld === 0`)
- Table styling: `table-fixed`, `bg-white rounded-lg shadow-sm border border-zinc-200`

**From Story 3.1 Review (deferred items relevant here):**
- Portfolio selector drops non-portfolio query params — drill-down adds `?ticker=` which is a different page, so no conflict
- `isClosed` false-negative for dividend-only tickers — pre-existing, not this story's scope

**From Story 2.3:**
- `searchParams: Promise<{...}>` pattern with `await` — already used in positions page
- `ControlsBar` accepts `portfolios`, `selectedPortfolio`, `timestamp` — already wired up

### Project Structure Notes

```
src/
├── app/positions/page.tsx                  # MODIFY: add closed positions + drill-down
├── components/domain/
│   ├── positions-table.tsx                 # MODIFY: generalize (accept columns, onRowClick, defaultSort)
│   └── positions-columns.tsx               # MODIFY: add closedPositionsColumns, export ClosedPositionRow type import
├── server/queries/
│   └── positions.ts                        # MODIFY: extract helper, add getClosedPositions()
│   └── positions.test.ts                   # MODIFY: add tests for getClosedPositions()
└── lib/formatting.ts                       # EXISTS: all formatters ready
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.2 — lines 594-629]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR6 — closed positions table columns]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR25 — drill-down navigation pattern]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR22 — table sorting cycle]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR24 — 40px row height, 32px section spacing]
- [Source: _bmad-output/planning-artifacts/prd.md#FR7 — closed positions with realized P&L]
- [Source: _bmad-output/planning-artifacts/prd.md#FR8 — closed positions portfolio filter]
- [Source: _bmad-output/planning-artifacts/prd.md#FR10 — position to transaction drill-down]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Drill-down navigation — lines 639-642]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Table Patterns — lines 649-667]
- [Source: _bmad-output/implementation-artifacts/3-1-active-positions-table.md — predecessor story patterns]
- [Source: src/server/queries/positions.ts — data fetching pattern to extract]
- [Source: src/components/domain/positions-table.tsx — component to generalize]
- [Source: src/components/domain/positions-columns.tsx — column pattern to follow]
- [Source: src/server/services/computation.ts — isClosed logic at line 149]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation, no blockers encountered.

### Completion Notes List

- Extracted `computeAllPositions()` private helper from `getActivePositions()` to share DB fetching logic between active and closed queries
- Added `ClosedPositionRow` interface and `getClosedPositions()` query function — filters to `isClosed` positions, maps to `{ value, display }` pairs using existing formatters
- Created `closedPositionsColumns` with 9 columns (added Avg Exit) following same patterns as active columns (accessorFn sorting, NumericCell, P&L coloring, sortUndefined: "last")
- Generalized `PositionsTable` to accept generic `columns`, `defaultSort`, and `onRowClick` props instead of hardcoding `activePositionsColumns`
- Created `DrillDownPositionsTable` wrapper that uses `useRouter()` to navigate to `/transactions?ticker=X&portfolio=Y` on row click (with `encodeURIComponent` on portfolio)
- Added hover styling: `cursor-pointer` + `hover:bg-zinc-100` on normal rows, `hover:bg-amber-100` on invalid-state rows
- Closed positions section renders with "Closed Positions" heading (text-[16px] font-semibold) only when closed positions exist; 32px gap via `space-y-8`
- Added 5 unit tests for `getClosedPositions()`: empty returns, formatting, excludes active, no computeAggregates call, null N/A handling
- All 102 tests pass, 0 lint errors

### Change Log

- 2026-04-07: Story 3.2 implemented — closed positions table, drill-down navigation, generalized PositionsTable
- 2026-04-07: Fixed avgEntryPrice=0 for closed positions (now uses totalInvested/totalSharesBought), added avgExitPrice field throughout stack

### File List

- `src/server/queries/positions.ts` — MODIFIED: extracted `computeAllPositions()` helper, added `ClosedPositionRow` interface, added `getClosedPositions()`
- `src/server/queries/positions.test.ts` — MODIFIED: added 5 tests for `getClosedPositions()`
- `src/components/domain/positions-columns.tsx` — MODIFIED: added `closedPositionsColumns` export
- `src/components/domain/positions-table.tsx` — MODIFIED: generalized to generic props, added `onRowClick`, hover styling, `DrillDownPositionsTable` wrapper
- `src/app/positions/page.tsx` — MODIFIED: calls both queries, renders both tables with drill-down, conditional closed section
- `src/server/types/positions.ts` — MODIFIED: added `avgExitPrice` to `ComputedPosition` interface
- `src/server/services/computation.ts` — MODIFIED: tracks totalSharesBought/Sold, fixed avgEntryPrice for closed positions, computes avgExitPrice
- `src/server/services/computation.test.ts` — MODIFIED: updated VOD.L test assertions for avgEntryPrice/avgExitPrice
- `src/server/queries/dashboard.test.ts` — MODIFIED: added avgExitPrice to makePosition helper
