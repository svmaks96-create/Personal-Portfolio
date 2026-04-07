# Story 2.2: Portfolio Dashboard with Metric Cards and Loading States

Status: done

## Story

As a user,
I want to see my portfolio's total value, cost basis, P&L, and cash returned on the dashboard with proper loading states,
So that I get a complete financial overview the moment I open the app.

## Acceptance Criteria

1. **Given** transactions and market data exist in the database, **When** I open the app (Dashboard tab loads by default), **Then** I see four MetricCard components in a grid row: Total Value, Cost Basis, Total P&L, Cash Returned. Metric values are 28px/bold, labels are 13px/regular. Total P&L is `emerald-600` if positive, `red-600` if negative. Cards have white background with `shadow-sm` on `zinc-100` page background. Card gap is 16px. (FR1, UX-DR3)

2. **Given** the dashboard is in aggregate "All Portfolios" mode (default), **When** positions with the same ticker exist across different portfolios, **Then** aggregate metrics combine those positions into merged values. Underlying data remains per-portfolio. (FR53)

3. **Given** market data exists for positions, **When** the dashboard computes position weight, **Then** each position's weight = market value / total portfolio market value, displayed to 1 decimal place with % suffix. (FR54)

4. **Given** no price data exists for a ticker, **When** the dashboard computes metrics, **Then** price-dependent values display as "N/A" for that position. Aggregate totals exclude N/A positions from price-dependent sums. (FR52)

5. **Given** the dashboard page is loading, **When** data is being fetched, **Then** Shadcn Skeleton components matching the MetricCard layout are displayed, matching card dimensions and grid layout. (UX-DR21)

6. **Given** the dashboard query functions are implemented, **When** I examine the code, **Then** `getDashboardMetrics` in `src/server/queries/dashboard.ts` calls the computation engine, and `src/app/page.tsx` is a thin Server Component orchestrator with no business logic.

7. **Given** no transactions exist, **When** I open the app, **Then** I see the existing empty state: "No positions yet. Import transactions to get started." with an "Import Transactions" button linking to `/import`.

## Tasks / Subtasks

- [x] Task 1: Install Shadcn Card and Skeleton components (AC: #1, #5)
  - [x] Run `npx shadcn@latest add card skeleton`
- [x] Task 2: Create `src/components/domain/metric-card.tsx` (AC: #1)
  - [x] Props: `{ label: string; value: string; variant?: 'default' | 'pnl'; pnlDirection?: 'positive' | 'negative' | null }`
  - [x] Card with white bg, `shadow-sm`, label at 13px/regular, value at 28px/bold
  - [x] When variant is `pnl`: apply `emerald-600` for positive, `red-600` for negative
  - [x] Server Component (no `'use client'`)
- [x] Task 3: Create `src/components/domain/metric-card-skeleton.tsx` (AC: #5)
  - [x] Skeleton matching MetricCard dimensions (label line + value line inside Card shell)
  - [x] Export `MetricCardsSkeleton` that renders 4 skeleton cards in same grid
- [x] Task 4: Create `src/server/queries/dashboard.ts` (AC: #2, #3, #4, #6)
  - [x] `getDashboardMetrics(portfolio?: string)` function
  - [x] Fetch all transactions (filtered by portfolio if provided)
  - [x] Fetch latest stock prices from market_data (type = 'stock_price', most recent date per symbol)
  - [x] Fetch all FX rates from market_data (type = 'fx_rate')
  - [x] Call `computePositions()` then `computeAggregates()`
  - [x] Return `AggregateMetrics` with formatted display strings
- [x] Task 5: Create `src/components/domain/dashboard-metrics.tsx` async Server Component (AC: #1, #2, #3, #4, #6)
  - [x] Accepts `portfolio?: string` prop
  - [x] Calls `getDashboardMetrics(portfolio)`
  - [x] Renders 4 MetricCard components with formatted values from `formatting.ts`
  - [x] Uses `formatCurrency` for Total Value, Cost Basis, Cash Returned
  - [x] Uses `formatPnL` for Total P&L
- [x] Task 6: Update `src/app/page.tsx` (AC: #5, #6, #7)
  - [x] Keep empty state check (getTransactionCount)
  - [x] Wrap `DashboardMetrics` in `<Suspense>` with `<MetricCardsSkeleton />` fallback
  - [x] Read `searchParams.portfolio` for portfolio filtering (future Story 2.3)
  - [x] Thin orchestrator only — no business logic
- [x] Task 7: Lint and verify (AC: all)
  - [x] `npm run lint` passes
  - [x] `npm run test:run` — all existing tests pass (85 tests, 7 files)
  - [x] Visual check: dashboard loads with metric cards when data exists

### Review Findings

- [x] [Review][Patch] `DashboardMetrics` not async — Suspense fallback never shows (AC5) [src/components/domain/dashboard-metrics.tsx:9] — FIXED
- [x] [Review][Patch] P&L zero treated as positive (green) — should be neutral color [src/components/domain/dashboard-metrics.tsx:15] — FIXED
- [x] [Review][Defer] `getTransactionCount()` not portfolio-aware — deferred, pre-existing (Story 2.3 scope) [src/app/page.tsx:12]
- [x] [Review][Defer] FX rates query fetches full history without dedup — deferred, pre-existing [src/server/queries/dashboard.ts:50-54]
- [x] [Review][Defer] `computeAggregates` returns 0 not null for empty arrays — deferred, pre-existing [src/server/services/computation.ts:247-250]

## Dev Notes

### Architecture Compliance

**Data flow (READ path):**
```
page.tsx (Server Component) → Suspense boundary
  → DashboardMetrics (async Server Component)
    → getDashboardMetrics() (query)
      → Drizzle queries → SQLite
      → computePositions() + computeAggregates() (computation service)
    → formatting.ts (creates display strings)
    → MetricCard (receives prepared props)
```

**Key rules:**
- `page.tsx` is a thin orchestrator — no business logic, no formatting, no computation
- Domain components receive `{ value: number, display: string }` — never format in components. For MetricCard specifically, pass the pre-formatted display string as the value prop.
- All financial arithmetic happens in `computation.ts` via `decimal.js` (already implemented)
- Use `null` for missing values, never `undefined`; formatters return `"N/A"` for null

### Existing Code to Reuse (DO NOT Recreate)

| What | File | Notes |
|------|------|-------|
| `computePositions()` | `src/server/services/computation.ts` | Groups by ticker+portfolio, handles FX, returns `ComputedPosition[]` |
| `computeAggregates()` | `src/server/services/computation.ts` | Sums metrics, computes weights, returns `AggregateMetrics` |
| `AggregateMetrics` type | `src/server/types/positions.ts` | Has `totalValue`, `totalCostBasis`, `totalPnl`, `totalCashReturned`, `positions[]` with `weight` |
| `ComputedPosition` type | `src/server/types/positions.ts` | Nullable price-dependent fields already handled |
| `formatCurrency()`, `formatPnL()` | `src/lib/formatting.ts` | Both handle `null` → `"N/A"` |
| `formatPercent()` | `src/lib/formatting.ts` | For weight display |
| `EmptyState` component | `src/components/domain/empty-state.tsx` | Already used in current `page.tsx` |
| `getTransactionCount()` | `src/server/queries/transactions.ts` | Synchronous (better-sqlite3) |
| DB schema | `src/server/db/schema.ts` | `transactions` and `market_data` tables |
| DB client | `src/server/db/index.ts` | Drizzle instance |

### Dashboard Query Implementation Guide

The `getDashboardMetrics` query must:

1. **Fetch transactions** — query all from `transactions` table, or filter by `portfolio` if param provided. Map rows to `TransactionInput[]` type.

2. **Fetch latest stock prices** — for each unique ticker, get the most recent `market_data` row where `type = 'stock_price'`. Build a `Record<string, MarketDataInput>` keyed by symbol.

3. **Fetch FX rates** — get all `market_data` rows where `type = 'fx_rate'`. Map to `FxRateInput[]`.

4. **Compute** — call `computePositions(transactions, marketData, fxRates)` then `computeAggregates(activePositions)`. Filter to only active positions (`!isClosed`) for aggregate metrics display.

5. **Return** — the `AggregateMetrics` object directly. Let the component layer handle formatting.

**better-sqlite3 is synchronous** — all Drizzle queries use `.get()` / `.all()` without `await`. The query function itself does NOT need to be async.

### Market Data Query Pattern

To get the latest price per symbol, use a subquery or sort+deduplicate approach:
```
SELECT * FROM market_data
WHERE type = 'stock_price'
ORDER BY date DESC
-- then deduplicate by symbol in JS (take first per symbol)
```

Alternatively, use Drizzle's query builder. The `market_data` table has an index on `(symbol, type, date)` which helps.

### Shadcn Component Installation

**Only `button.tsx` is currently installed.** You need:
```bash
npx shadcn@latest add card skeleton
```

This creates `src/components/ui/card.tsx` and `src/components/ui/skeleton.tsx`. Import directly from `@/components/ui/card` and `@/components/ui/skeleton`.

### Loading State Pattern

Use Next.js `<Suspense>` in `page.tsx` to wrap the async `DashboardMetrics` component. The fallback renders `MetricCardsSkeleton` — 4 skeleton cards in the same grid layout as the real cards.

```tsx
// Pattern for page.tsx
import { Suspense } from "react";
<Suspense fallback={<MetricCardsSkeleton />}>
  <DashboardMetrics portfolio={searchParams.portfolio} />
</Suspense>
```

The `DashboardMetrics` component is an async Server Component that does the data fetching and computation. Suspense streams the skeleton first, then swaps in real content.

### Typography and Styling Specifics

| Element | Tailwind Classes |
|---------|-----------------|
| Metric value | `text-[28px] font-bold text-zinc-900` |
| Metric label | `text-[13px] font-normal text-zinc-500` |
| P&L positive | `text-emerald-600` |
| P&L negative | `text-red-600` |
| Card | `bg-white shadow-sm` (from Shadcn Card) |
| Card grid | `grid grid-cols-4 gap-4` (16px gap) |
| Page background | `bg-zinc-100` (already in layout.tsx body) |
| Section spacing | `space-y-8` or `mb-8` between cards and future content |

### Anti-Patterns to Avoid

- DO NOT import `computation.ts` or any `src/server/` module from client components
- DO NOT use `'use client'` on MetricCard — it's a pure display component (Server Component)
- DO NOT format numbers inside MetricCard — pass pre-formatted strings
- DO NOT use `new Date()` — use `date-fns` if date operations needed
- DO NOT create API routes — all data flows through Server Components
- DO NOT store computed dashboard metrics in the database
- DO NOT use `useSearchParams()` in page.tsx — read `searchParams` from props
- DO NOT await synchronous Drizzle/better-sqlite3 calls

### Previous Story (2.1) Intelligence

**Key learnings from Story 2.1:**
- FMP batch endpoints return HTTP 402 — individual calls with `Promise.all()` parallelization
- better-sqlite3 queries are synchronous — `.get()` / `.all()` return directly, no `await`
- `console.error` before returning generic error messages for diagnostics
- Drizzle `db.transaction()` for atomic multi-row inserts
- Type guards (e.g., `isValidQuote`) prevent unsafe data from entering the DB
- Server Actions follow orchestration pattern: query → service → write → revalidate → return ActionResult
- All 79 existing tests pass across 6 test files — keep them passing

**Files created in 2.1 that this story depends on:**
- `src/server/actions/market-data.ts` — `refreshPrices()` and `refreshFxRates()` Server Actions
- `src/server/queries/market-data.ts` — `getExistingSymbolsForDate()` and `getLatestFetchTimestamp()`
- `src/server/services/fmp.ts` — FMP API service layer
- `src/server/types/market-data.ts` — FMP response types

### Project Structure Notes

All new files align with the established project structure:
- `src/components/domain/metric-card.tsx` — domain component (architecture specifies this exact file)
- `src/components/domain/metric-card-skeleton.tsx` — loading state component
- `src/components/domain/dashboard-metrics.tsx` — async Server Component for data orchestration
- `src/server/queries/dashboard.ts` — read operation (architecture specifies this exact file)
- `src/components/ui/card.tsx` — Shadcn managed (via `npx shadcn add`)
- `src/components/ui/skeleton.tsx` — Shadcn managed (via `npx shadcn add`)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 2, Story 2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow, Project Structure, FR-to-Structure Mapping]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — MetricCard spec, Typography, Color System, Loading States]
- [Source: _bmad-output/planning-artifacts/prd.md — FR1, FR2, FR3, FR4, FR52, FR53, FR54]
- [Source: src/server/services/computation.ts — computePositions, computeAggregates]
- [Source: src/server/types/positions.ts — AggregateMetrics, ComputedPosition]
- [Source: src/lib/formatting.ts — formatCurrency, formatPnL, formatPercent]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- No issues encountered during implementation

### Completion Notes List
- Installed Shadcn Card and Skeleton UI components
- Created MetricCard server component with PnL color variants (emerald-600/red-600)
- Created MetricCardsSkeleton with 4 skeleton cards matching real card layout
- Created getDashboardMetrics query: fetches transactions, latest stock prices (deduplicated by symbol), FX rates, computes positions via existing computation engine, filters to active positions only
- Created DashboardMetrics async server component that formats values via formatting.ts and renders 4 MetricCards
- Updated page.tsx: async with Promise-based searchParams (Next.js current API), Suspense boundary with skeleton fallback, portfolio filter passthrough for Story 2.3
- Added 4 unit tests for dashboard query (mocked db, tested active/closed filtering, null handling)
- All 85 tests pass (81 existing + 4 new), lint clean
- Visual verification: dashboard renders correctly with seed data

### Change Log
- 2026-04-07: Story 2.2 implemented — portfolio dashboard with metric cards, loading states, and dashboard query

### File List
- src/components/ui/card.tsx (new — Shadcn managed)
- src/components/ui/skeleton.tsx (new — Shadcn managed)
- src/components/domain/metric-card.tsx (new)
- src/components/domain/metric-card-skeleton.tsx (new)
- src/server/queries/dashboard.ts (new)
- src/server/queries/dashboard.test.ts (new)
- src/components/domain/dashboard-metrics.tsx (new)
- src/app/page.tsx (modified)
