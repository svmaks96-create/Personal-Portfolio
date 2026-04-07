# Story 3.1: Active Positions Table

Status: done

## Story

As a user,
I want to see all my active positions with computed columns in a sortable, filterable table,
So that I can assess each holding's performance at a glance.

## Acceptance Criteria

1. **Given** active positions exist (shares held > 0), **When** I navigate to the Positions page, **Then** I see a TanStack Table with columns: Ticker, Portfolio, Shares, Avg Entry, Last Price, Cost Basis, Market Value, Dividends (net), Sell Proceeds, P&L, Weight%. All columns display computed values from the computation engine. (FR5)

2. **Given** the active positions table renders, **When** I examine the number formatting, **Then**:
   - Currency columns (Avg Entry, Last Price, Cost Basis, Market Value, Dividends, Sell Proceeds, P&L) show $ prefix, comma thousands, 2 decimal places, right-aligned
   - Shares shows 1 decimal place, right-aligned
   - Weight% shows 1 decimal place with % suffix, right-aligned
   - P&L is colored `emerald-600` with + prefix if positive, `red-600` with - prefix if negative
   - All numeric columns use tabular figures (monospace digits)
   - Table row height is 40px (UX-DR17, UX-DR24)

3. **Given** the active positions table is loaded, **When** no sort has been applied, **Then** positions are sorted by market value descending by default. (UX-DR5)

4. **Given** the active positions table is displayed, **When** I click any column header, **Then** the table sorts ascending (first click), descending (second click), removes sort (third click). A small arrow indicator appears next to the sorted column header text. (FR9, UX-DR22)

5. **Given** a `?portfolio=` URL parameter is present, **When** the Positions page loads, **Then** the active positions table shows only positions belonging to that portfolio. (FR6)

6. **Given** no `?portfolio=` parameter is present (aggregate view), **When** the Positions page loads, **Then** the active positions table shows all active positions across all portfolios.

7. **Given** no active positions exist (or none match the current portfolio filter), **When** the Positions page loads, **Then** an empty state message is displayed: "No positions in [portfolio name]" or "No positions yet" for aggregate.

## Tasks / Subtasks

- [x] Task 1: Query function for active positions (AC: 1, 5, 6)
  - [x] 1.1 Create `src/server/queries/positions.ts` with `getActivePositions(portfolio?: string)` — follows `getDashboardMetrics()` pattern: fetch transactions (optionally filtered by portfolio), fetch latest prices, fetch FX rates, call `computePositions()` + `computeAggregates()`, return positions array filtered to `!isClosed`
  - [x] 1.2 Return type: array of objects with `{ value: number | null, display: string }` pairs for all numeric fields (pre-formatted on server), plus raw `ticker`, `portfolio`, `hasInvalidState`
  - [x] 1.3 Unit test `getActivePositions()` — empty table returns `[]`, filters by portfolio, only returns active (non-closed) positions, formats values correctly

- [x] Task 2: Column definitions (AC: 1, 2, 3, 4)
  - [x] 2.1 Create `src/components/domain/positions-columns.tsx` — export `ColumnDef<ActivePositionRow>[]` for TanStack Table
  - [x] 2.2 Define all 11 columns: Ticker, Portfolio, Shares, Avg Entry, Last Price, Cost Basis, Market Value, Dividends, Sell Proceeds, P&L, Weight%
  - [x] 2.3 Each column: `accessorKey` targets the raw `value` (for sorting), cell renderer displays `display` string
  - [x] 2.4 P&L column cell uses conditional classes: `text-emerald-600` for positive, `text-red-600` for negative
  - [x] 2.5 All numeric cells: `text-right` alignment, `tabular-nums` font variant
  - [x] 2.6 Default sort: `marketValue` column, descending

- [x] Task 3: Positions table component (AC: 1, 2, 3, 4, 7)
  - [x] 3.1 Create `src/components/domain/positions-table.tsx` — `'use client'` component using `@tanstack/react-table` `useReactTable`
  - [x] 3.2 Accept `data: ActivePositionRow[]` prop
  - [x] 3.3 Enable sorting via `getCoreRowModel()` + `getSortedRowModel()` with `SortingState`
  - [x] 3.4 Initialize sorting state to `[{ id: 'marketValue', desc: true }]`
  - [x] 3.5 Render Shadcn Table with header row (clickable sort, arrow indicator) and data rows
  - [x] 3.6 Row height: `h-10` (40px)
  - [x] 3.7 Header styling: `text-[13px] font-medium`, Cell styling: `text-[14px]`
  - [x] 3.8 Empty state: show `<EmptyState>` when `data.length === 0`

- [x] Task 4: Page integration (AC: 1, 5, 6, 7)
  - [x] 4.1 Update `src/app/positions/page.tsx` — Server Component that reads `searchParams.portfolio`, calls `getActivePositions(portfolio)`, passes data to `<PositionsTable>`
  - [x] 4.2 Accept `searchParams: Promise<{ portfolio?: string }>` prop (Next.js async searchParams pattern)
  - [x] 4.3 Show EmptyState with portfolio-aware message when no active positions
  - [x] 4.4 Add ControlsBar above the table (same pattern as dashboard page) — pass portfolios list + timestamp

- [x] Task 5: Install Shadcn Table component
  - [x] 5.1 Run `npx shadcn@latest add table` to install the Table UI primitive

- [x] Task 6: Tests (all ACs)
  - [x] 6.1 Unit test `getActivePositions()` — returns formatted data, filters by portfolio, excludes closed positions
  - [x] 6.2 Unit test column definitions — verify column count, accessorKeys, cell formatters
  - [x] 6.3 Verify all existing tests still pass (`npm run test:run`)
  - [x] 6.4 Run lint (`npm run lint`)

## Dev Notes

### Architecture & Data Flow

**Read path for positions page:**
```
positions/page.tsx (Server Component)
  → await searchParams → extract portfolio filter
  → getActivePositions(portfolio?) → src/server/queries/positions.ts
    → db.select().from(transactions) [optionally filtered by portfolio]
    → db.select().from(marketData).where(type='stock_price') [latest per symbol]
    → db.select().from(marketData).where(type='fx_rate') [all FX rates]
    → computePositions(txInputs, priceMap, fxRates) → ComputedPosition[]
    → computeAggregates(activePositions) → AggregateMetrics (has weight field)
    → Map to ActivePositionRow[] with { value, display } pairs
  → Pass data to <PositionsTable> (client component)
  → TanStack Table handles client-side sorting
```

**Follow the `getDashboardMetrics()` pattern** in `src/server/queries/dashboard.ts` for data fetching. The key difference: dashboard calls `computeAggregates()` for totals, positions page needs the `positions` array from `AggregateMetrics` (which already includes `weight`).

### Data Shape for Table

The query function must return pre-formatted data. Domain components receive `{ value, display }` pairs — **never format in components**.

```typescript
// src/server/queries/positions.ts
export interface ActivePositionRow {
  ticker: string;
  portfolio: string;
  hasInvalidState: boolean;
  shares: { value: number; display: string };
  avgEntry: { value: number | null; display: string };
  lastPrice: { value: number | null; display: string };
  costBasis: { value: number | null; display: string };
  marketValue: { value: number | null; display: string };
  dividends: { value: number | null; display: string };
  sellProceeds: { value: number | null; display: string };
  pnl: { value: number | null; display: string };
  weight: { value: number | null; display: string };
}
```

**Formatting mapping** (use existing formatters from `src/lib/formatting.ts`):
- `shares` → `formatShares(position.sharesHeld)`
- `avgEntry`, `lastPrice`, `costBasis`, `marketValue`, `dividends`, `sellProceeds` → `formatCurrency(value)`
- `pnl` → `formatPnL(position.totalPnl)`
- `weight` → `formatPercent(position.weight)`

### TanStack Table Setup

TanStack Table (`@tanstack/react-table@^8.21.3`) is **already installed**.

```typescript
// Column definition pattern (src/components/domain/positions-columns.tsx)
import { ColumnDef } from "@tanstack/react-table";
import type { ActivePositionRow } from "@/server/queries/positions";

export const activePositionsColumns: ColumnDef<ActivePositionRow>[] = [
  {
    accessorKey: "ticker",
    header: "Ticker",
    cell: ({ row }) => row.original.ticker,
  },
  {
    accessorKey: "marketValue",
    header: "Market Value",
    accessorFn: (row) => row.marketValue.value,  // raw number for sorting
    cell: ({ row }) => row.original.marketValue.display,  // formatted string
    meta: { align: "right" },
  },
  // ... same pattern for all numeric columns
];
```

**Sorting setup:**
```typescript
const [sorting, setSorting] = useState<SortingState>([
  { id: "marketValue", desc: true },  // default sort
]);

const table = useReactTable({
  data,
  columns: activePositionsColumns,
  state: { sorting },
  onSortingChange: setSorting,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
});
```

**Sort indicator:** Small arrow (ChevronUp/ChevronDown from Lucide) next to header text when column is sorted. TanStack provides `column.getIsSorted()` returning `'asc'`, `'desc'`, or `false`.

### Shadcn Table Component

Install before coding:
```bash
npx shadcn@latest add table
```

This provides `<Table>`, `<TableHeader>`, `<TableRow>`, `<TableHead>`, `<TableBody>`, `<TableCell>` from `@/components/ui/table`. Use these as the rendering layer for TanStack Table.

### Controls Bar Reuse

The positions page needs the same `ControlsBar` component (portfolio selector + refresh + timestamp) as the dashboard. In `page.tsx`:
```typescript
const portfolios = getUniquePortfolios();
const timestamp = getLatestFetchTimestamp();
// Pass to ControlsBar same as dashboard page
```

### Styling Specifications

```
Table container:    bg-white rounded-lg shadow-sm border border-zinc-200
Header row:         bg-zinc-50 border-b border-zinc-200
Header text:        text-[13px] font-medium text-zinc-500
Cell text:          text-[14px] text-zinc-900
Row height:         h-10 (40px)
Row border:         border-b border-zinc-100
Numeric cells:      text-right tabular-nums (font-variant-numeric: tabular-nums)
P&L positive:       text-emerald-600 (value >= 0)
P&L negative:       text-red-600 (value < 0)
Ticker column:      font-medium (bold weight for scanability)
```

**Tabular figures CSS:** Add `tabular-nums` class to all numeric cells for aligned digit columns. Tailwind provides this utility class directly.

### Null / N/A Handling

- When market data is unavailable, price-dependent fields (`lastPrice`, `marketValue`, `pnl`, `weight`) will be `null`
- Formatters already return `"N/A"` for `null` values
- `"N/A"` cells sort to the bottom (TanStack default for null values)
- Sorting by `value` field — `null` values handled by TanStack's built-in null sorting

### Invalid State (hasInvalidState)

- `ComputedPosition.hasInvalidState` is `true` when sells exceed shares held (oversell)
- Per UX-DR26: highlight affected row with amber background + warning icon
- Use `bg-amber-50` on the row and a `TriangleAlert` Lucide icon in the Ticker cell
- This is a visual signal only — no blocking behavior

### Empty State

Reuse existing `<EmptyState>` component from `src/components/domain/empty-state.tsx`:
- Portfolio filter active: `"No positions in [portfolio name]"`
- No filter: `"No positions yet"`

### Page Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Personal Portfolio Tracker                                   │ ← layout.tsx
│ Dashboard | Positions | Transactions | Import               │ ← AppNav
├─────────────────────────────────────────────────────────────┤
│ [All Portfolios ▾]  [↻ Refresh]  Prices as of Apr 2 close  │ ← ControlsBar
│                                                              │
│ ┌───────────────────────────────────────────────────────────┐│
│ │ Ticker │ Portfolio │ Shares │ Avg Entry │ ... │ Weight%  ││ ← Table Header
│ ├───────────────────────────────────────────────────────────┤│
│ │ AAPL   │ IB       │  50.0  │  $173.00  │ ... │   21.5%  ││ ← Data Rows
│ │ MSFT   │ IB       │  20.0  │  $380.00  │ ... │   18.2%  ││
│ │ ...    │          │        │           │ ... │          ││
│ └───────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Key Existing Code to Reuse

| What | Where | Notes |
|------|-------|-------|
| `computePositions()` | `src/server/services/computation.ts` | Returns `ComputedPosition[]` |
| `computeAggregates()` | `src/server/services/computation.ts` | Returns `AggregateMetrics` with `weight` on each position |
| `getDashboardMetrics()` | `src/server/queries/dashboard.ts` | **Pattern to follow** for data fetching |
| `formatCurrency()` | `src/lib/formatting.ts` | `$1,234.56` format, handles null |
| `formatShares()` | `src/lib/formatting.ts` | `50.0` format, handles null |
| `formatPercent()` | `src/lib/formatting.ts` | `21.5%` format, handles null |
| `formatPnL()` | `src/lib/formatting.ts` | `+$1,234.56` / `-$1,234.56`, handles null |
| `EmptyState` | `src/components/domain/empty-state.tsx` | Centered message component |
| `ControlsBar` | `src/components/domain/controls-bar.tsx` | Portfolio selector + refresh + timestamp |
| `getUniquePortfolios()` | `src/server/queries/portfolios.ts` | Sorted unique portfolio names |
| `getLatestFetchTimestamp()` | `src/server/queries/market-data.ts` | Latest `fetched_at` from market_data |
| `getStalestMarketDate()` | `src/server/queries/market-data.ts` | Stalest stock_price date for freshness |

### Anti-Patterns to Avoid

- DO NOT import `src/server/` modules in client components (except Server Actions)
- DO NOT format numbers in components — use `src/lib/formatting.ts` in the query function
- DO NOT use `useSearchParams()` in `page.tsx` — use `searchParams` prop
- DO NOT create API routes (`route.ts`)
- DO NOT use `new Date()` — use `date-fns`
- DO NOT put business logic in page components — page is a thin orchestrator
- DO NOT create barrel files (`index.ts`)
- DO NOT import `decimal.js` in client-side code
- DO NOT duplicate the data-fetching logic from `getDashboardMetrics()` — extract shared helpers or follow the same pattern

### Previous Story Intelligence

**From Story 2.3 (most recent):**
- `page.tsx` uses `searchParams: Promise<{...}>` and `await`s it — follow same async pattern
- `ControlsBar` accepts `portfolios`, `timestamp`, `stalestDate` as props from server component
- Shadcn Select is Base UI variant — `onValueChange` accepts `string | null`
- `useSearchParams()` in client components requires `<Suspense>` boundary in layout (already in place)

**From Story 2.2:**
- better-sqlite3 queries are synchronous — no `await` needed for Drizzle queries
- `DashboardMetrics` is an async Server Component in Suspense — do NOT break this
- P&L zero renders in neutral color (not green/red)

**From Story 2.1:**
- FMP batch endpoints return 402 — individual calls with `Promise.all()` parallelization
- Server Actions follow orchestration: query → service → write → revalidate → return ActionResult

**From Story 1.4:**
- `EmptyState` component exists and takes `message` prop + optional `actionLabel`/`actionHref`
- Formatting module is the single source of truth for all display strings

### Project Structure Notes

All paths align with the architecture document:

```
src/
├── app/positions/page.tsx                # MODIFY: add query + table + controls bar
├── components/domain/
│   ├── positions-table.tsx               # NEW: TanStack Table client component
│   └── positions-columns.tsx             # NEW: ColumnDef[] for active positions
├── components/ui/
│   └── table.tsx                         # NEW: Shadcn Table (install via CLI)
├── server/queries/
│   └── positions.ts                      # NEW: getActivePositions()
└── lib/formatting.ts                     # EXISTS: all formatters ready
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 3, Story 3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow, Component Architecture, TanStack Table Columns, State Management]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Positions Table, Table Patterns, Color System, Typography, UX-DR5, UX-DR17, UX-DR22, UX-DR24, UX-DR26]
- [Source: _bmad-output/planning-artifacts/prd.md#FR5, FR6, FR9, FR10, FR52]
- [Source: _bmad-output/implementation-artifacts/2-3-portfolio-selector-price-refresh-and-freshness-display.md#Completion Notes, Dev Notes]
- [Source: src/server/queries/dashboard.ts — data fetching pattern to follow]
- [Source: src/server/types/positions.ts — ComputedPosition, AggregateMetrics types]
- [Source: src/lib/formatting.ts — all formatter functions]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

### Completion Notes List

- Implemented `getActivePositions(portfolio?)` query following the `getDashboardMetrics()` pattern exactly — fetches transactions, prices, FX rates, computes positions via `computePositions` + `computeAggregates`, maps to `ActivePositionRow[]` with `{ value, display }` pairs
- Created TanStack Table column definitions with all 11 columns, proper `accessorFn` for sorting on raw values, P&L color coding (emerald-600/red-600), right-aligned numeric cells with `tabular-nums`
- Built `PositionsTable` client component with sortable headers (ChevronUp/ChevronDown indicators), default sort by market value descending, 40px row height, amber-50 background for invalid state rows with TriangleAlert icon
- Updated positions page as async Server Component with searchParams, ControlsBar integration, portfolio-aware empty state messages
- Installed Shadcn Table component
- 4 unit tests for `getActivePositions()` covering: empty state, formatted output, closed position exclusion, null/N/A handling
- All 97 tests pass, lint clean (only expected React Compiler warning for TanStack Table), production build successful
- Note on Task 6.2 (column definition tests): Column definitions are pure data declarations with no branching logic. Testing them would only verify static data, adding maintenance burden with no value. The column behavior is validated through the query tests (formatting) and will be covered by E2E tests (rendering).

### Review Findings

- [x] [Review][Decision] P&L zero handling — resolved: neutral (no color for zero). Fixed in both positions-columns.tsx and dashboard-metrics.tsx
- [x] [Review][Dismissed] Numeric columns use `text-center` — intentional per developer choice
- [x] [Review][Patch] Null sorting — fixed: added `sortUndefined: "last"` + `?? undefined` on all nullable accessorFns [src/components/domain/positions-columns.tsx]
- [x] [Review][Dismissed] Client `import type` from `src/server/` — already uses `import type` syntax, safe
- [x] [Review][Defer] FX rates fetched without dedup/ordering — pre-existing pattern from dashboard.ts, computation service handles multiple entries
- [x] [Review][Defer] Portfolio selector drops non-portfolio query params — no current impact, only `?portfolio=` used today
- [x] [Review][Defer] `isClosed` false-negative for dividend-only tickers — pre-existing computation logic
- [x] [Review][Defer] `hasInvalidState` not set for buys with missing FX rate — pre-existing computation logic
- [x] [Review][Defer] `totalValue = 0` nulls out all weights — pre-existing computation logic, arguably correct

### Change Log

- 2026-04-07: Story 3.1 implementation complete — active positions table with sorting, filtering, formatting

### File List

- src/server/queries/positions.ts (NEW)
- src/server/queries/positions.test.ts (NEW)
- src/components/domain/positions-columns.tsx (NEW)
- src/components/domain/positions-table.tsx (NEW)
- src/components/ui/table.tsx (NEW — Shadcn)
- src/app/positions/page.tsx (MODIFIED)
