# Story 2.3: Portfolio Selector, Price Refresh, and Freshness Display

Status: done

## Story

As a user,
I want to switch between portfolio views, refresh market data, and always know how current my prices are,
So that I can view any portfolio in isolation and trust the data freshness.

## Acceptance Criteria

1. **Given** the app is loaded, **When** I look at the controls bar below the tab navigation, **Then** I see a portfolio selector dropdown, a refresh button, and a price timestamp. The portfolio selector defaults to "All Portfolios" (no `?portfolio=` param in URL). The dropdown lists all unique portfolio names from the transactions table. (FR2, UX-DR12)

2. **Given** I select a specific portfolio from the dropdown, **When** the selection changes, **Then** the URL updates to `?portfolio=[selected]`, all dashboard metrics recalculate to show only that portfolio's data, and the portfolio selection persists when I switch tabs (URL param carried in tab links). (FR2)

3. **Given** I select "All Portfolios" from the dropdown, **When** the selection changes, **Then** the `?portfolio=` param is removed from the URL and metrics show the aggregate view across all portfolios.

4. **Given** market data exists in the `market_data` table, **When** the PriceTimestamp component renders, **Then** it displays "Prices as of [date] close" using the most recent `fetched_at` from market_data. Text is 12px/regular. (FR3, UX-DR4)

5. **Given** the most recent price data is older than the current date, **When** the PriceTimestamp component renders, **Then** the timestamp text changes to amber color (`amber-500`) and an amber dot indicator appears next to the text. (FR4, UX-DR4)

6. **Given** I click the Refresh button (secondary style: white bg, `zinc-900` border), **When** the refresh is in progress, **Then** `refreshPrices` and `refreshFxRates` Server Actions fire in parallel, the button shows a spinner and becomes disabled, the timestamp text is replaced with "Refreshing...", and after completion the timestamp updates and all dashboard metrics recalculate. (FR50, UX-DR13)

7. **Given** the refresh fails (FMP unreachable), **When** the Server Actions return failure, **Then** PriceTimestamp shows "Unable to refresh — last prices from [date]" in amber. No modal or toast — inline and contextual. (UX-DR20)

8. **Given** the button hierarchy is established, **When** buttons render, **Then** only one primary button (solid `zinc-900`, white text) per view. Secondary buttons use white bg with `zinc-900` border. All buttons use 13px font, medium weight. (UX-DR16)

## Tasks / Subtasks

- [x] Task 1: Portfolio list query (AC: 1)
  - [x] 1.1 Add `getUniquePortfolios()` in `src/server/queries/portfolios.ts` — query distinct `portfolio` from `transactions` table, return sorted `string[]`
- [x] Task 2: Portfolio Selector component (AC: 1, 2, 3)
  - [x] 2.1 Create `src/components/domain/portfolio-selector.tsx` — `'use client'` component using Shadcn Select
  - [x] 2.2 Accept `portfolios: string[]` prop and current `selectedPortfolio: string | undefined`
  - [x] 2.3 Default display: "All Portfolios" when no `?portfolio=` param
  - [x] 2.4 On change: use `useRouter().push()` to update URL with `?portfolio=` param (or remove it for "All Portfolios")
  - [x] 2.5 Ensure `startTransition` wraps router navigation for non-blocking updates
- [x] Task 3: PriceTimestamp component (AC: 4, 5, 7)
  - [x] 3.1 Create `src/components/domain/price-timestamp.tsx` — `'use client'` component
  - [x] 3.2 Accept `timestamp: string | null` and `isRefreshing: boolean` and `refreshError: string | null` props
  - [x] 3.3 Normal state: "Prices as of [formatted date] close" in 12px zinc-500
  - [x] 3.4 Stale state: amber-500 text + amber dot (`w-2 h-2 rounded-full bg-amber-500`) when `fetchedAt` date < current date
  - [x] 3.5 Loading state: "Refreshing..." replaces timestamp text
  - [x] 3.6 Error state: "Unable to refresh — last prices from [date]" in amber-500
  - [x] 3.7 Add `formatTimestampDate` helper in `src/lib/formatting.ts` — format ISO timestamp to "MMM d" (e.g., "Apr 2")
- [x] Task 4: Refresh Button component (AC: 6)
  - [x] 4.1 Create `src/components/domain/refresh-button.tsx` — `'use client'` component
  - [x] 4.2 Secondary button style: `bg-white border border-zinc-900 text-zinc-900 text-[13px] font-medium`
  - [x] 4.3 On click: call `refreshPrices()` + `refreshFxRates()` via `Promise.all()` — both already exist in `src/server/actions/market-data.ts`
  - [x] 4.4 Loading state: spinner icon + disabled button
  - [x] 4.5 Pass `isRefreshing` and `refreshError` state up to parent (or use shared client wrapper)
- [x] Task 5: Controls bar integration (AC: 1, 2, 3, 4, 5, 6, 7, 8)
  - [x] 5.1 Create `src/components/domain/controls-bar.tsx` — `'use client'` wrapper that composes PortfolioSelector + RefreshButton + PriceTimestamp
  - [x] 5.2 Manages shared state: `isRefreshing`, `refreshError` between RefreshButton and PriceTimestamp
  - [x] 5.3 Layout: horizontal row with `flex items-center gap-4`, portfolio selector left, refresh button center, timestamp right
  - [x] 5.4 Place controls bar in `src/app/page.tsx` (above the DashboardMetrics Suspense block, within page content area — NOT in layout.tsx header)
- [x] Task 6: AppNav portfolio persistence (AC: 2)
  - [x] 6.1 Update `src/components/domain/app-nav.tsx` to carry `?portfolio=` param in tab `<Link>` hrefs
  - [x] 6.2 Read current `?portfolio=` from `useSearchParams()` and append to all tab links
- [x] Task 7: Formatting helper (AC: 4)
  - [x] 7.1 Add `formatTimestampDate(isoTimestamp: string): string` to `src/lib/formatting.ts` — returns "MMM d" format using `date-fns` `format` and `parseISO`
- [x] Task 8: Tests (all ACs)
  - [x] 8.1 Unit test `getUniquePortfolios()` — empty table returns `[]`, multiple portfolios returned sorted, deduplication works
  - [x] 8.2 Unit test `formatTimestampDate()` — correct format output
  - [x] 8.3 Verify existing tests still pass (`npm run test:run`)
  - [x] 8.4 Run lint (`npm run lint`)

### Review Findings

- [x] [Review][Decision] Sequential refresh vs AC6 "in parallel" — Accepted as-is. Next.js serializes server actions from client; true parallelism would require a combined server action. Deviation accepted as framework limitation. [src/components/domain/controls-bar.tsx:30-31]
- [x] [Review][Decision→Patch] `getStalestMarketDate` mixes stock/FX types — Added `WHERE type = 'stock_price'` filter. [src/server/queries/market-data.ts]
- [x] [Review][Patch] Both-fail error swallows second failure — Now collects both error messages. [src/components/domain/controls-bar.tsx]
- [x] [Review][Patch] `refreshError` not shown when `timestamp` is null — Error now displayed even without prior timestamp. [src/components/domain/price-timestamp.tsx]
- [x] [Review][Patch] `isToday` timezone bug with "yyyy-MM-dd" strings — Switched to direct string comparison with `format(new Date(), "yyyy-MM-dd")`. [src/components/domain/price-timestamp.tsx]
- [x] [Review][Patch] `timestamp=0` not rejected by `isValidQuote` — Added `> 0` check. [src/server/services/fmp.ts]
- [x] [Review][Patch] Missing newline at EOF in `market-data.ts` [src/server/actions/market-data.ts]
- [x] [Review][Defer] `getExistingSymbolDates` fetches all historical rows per symbol [src/server/queries/market-data.ts:15-22] — deferred, performance concern for future data growth
- [x] [Review][Defer] No unique constraint on `market_data(symbol, type, date)` [src/server/db/schema.ts] — deferred, pre-existing schema concern
- [x] [Review][Defer] `fromUnixTime` UTC vs exchange-local trading date semantics [src/server/actions/market-data.ts] — deferred, FMP timestamp semantics need research

## Dev Notes

### Architecture & Data Flow

**Controls bar data flow:**
```
page.tsx (Server Component)
  → getUniquePortfolios() → string[] of portfolio names
  → getLatestFetchTimestamp() → string | null (already exists in src/server/queries/market-data.ts)
  → Pass both as props to ControlsBar (client component)
  → ControlsBar manages refresh state, composes child components
  → On refresh: calls refreshPrices() + refreshFxRates() in parallel
  → Server Actions call revalidatePath('/', 'layout') → page re-renders with fresh data
```

**Portfolio filtering flow:**
```
User selects portfolio → URL updates to ?portfolio=X
  → Next.js re-renders page.tsx with new searchParams
  → getDashboardMetrics(portfolio) already accepts optional portfolio filter
  → Metrics re-render showing filtered data
```

**Stale detection logic (client-side):**
```typescript
// Compare fetchedAt date to today using date-fns
import { parseISO, isToday } from "date-fns";
const isStale = timestamp ? !isToday(parseISO(timestamp)) : false;
```

### Key Existing Code to Build On

| What | Where | Notes |
|------|-------|-------|
| `refreshPrices()` | `src/server/actions/market-data.ts` | Ready to call from client, returns `ActionResult<RefreshResult>` |
| `refreshFxRates()` | `src/server/actions/market-data.ts` | Same pattern, parallel with refreshPrices |
| `getLatestFetchTimestamp()` | `src/server/queries/market-data.ts` | Returns `string \| null`, use for freshness display |
| `getDashboardMetrics(portfolio?)` | `src/server/queries/dashboard.ts` | Already accepts optional portfolio filter |
| `DashboardMetrics` | `src/components/domain/dashboard-metrics.tsx` | Async Server Component, receives portfolio prop |
| `AppNav` | `src/components/domain/app-nav.tsx` | Client component, needs portfolio param added to links |
| `formatDate()` | `src/lib/formatting.ts` | Existing "MMM d, yyyy" format — need shorter "MMM d" variant for timestamp |
| `ActionResult<T>` | `src/server/types/action-result.ts` | Standard return type for server actions |

### Controls Bar Placement

The controls bar goes in `page.tsx` content area, NOT in `layout.tsx` header. The header contains only the title and AppNav tabs. Controls bar sits between the header and the metric cards:

```
┌─────────────────────────────────────────┐
│ Personal Portfolio Tracker              │ ← layout.tsx header
│ Dashboard | Positions | Transactions    │ ← AppNav in layout.tsx
├─────────────────────────────────────────┤
│ [All Portfolios ▾]  [↻ Refresh]  Prices as of Apr 2 close │ ← ControlsBar in page.tsx
│                                         │
│ ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐ │
│ │ Total  │ │ Cost   │ │ Total  │ │ Cash   │ │ ← MetricCards
│ │ Value  │ │ Basis  │ │ P&L    │ │Returned│ │
│ └────────┘ └────────┘ └────────┘ └────────┘ │
└─────────────────────────────────────────┘
```

### Shadcn Components Needed

Install before coding:
```bash
npx shadcn@latest add select
```
The `button` component may already be installed — check `src/components/ui/button.tsx`. If not:
```bash
npx shadcn@latest add button
```

### Client/Server Boundary

- `ControlsBar`, `PortfolioSelector`, `RefreshButton`, `PriceTimestamp` are all `'use client'` — they need hooks (`useState`, `useRouter`, `useTransition`, `useSearchParams`)
- `page.tsx` remains a Server Component — it queries data and passes it as props to the controls bar
- Server Actions (`refreshPrices`, `refreshFxRates`) are imported directly in client components — Next.js handles the boundary
- Do NOT use `useSearchParams()` in `page.tsx` — use `searchParams` prop (architecture anti-pattern)

### Styling Reference

```
Controls bar:     flex items-center gap-4
Portfolio select: Shadcn Select, default width auto
Refresh button:   bg-white border border-zinc-900 text-zinc-900 text-[13px] font-medium px-3.5 py-1.5
Timestamp text:   text-[12px] font-normal text-zinc-500 (normal) | text-amber-500 (stale)
Amber dot:        w-2 h-2 rounded-full bg-amber-500 inline-block
Spinner:          animate-spin h-4 w-4 (use Lucide Loader2 icon)
```

### Anti-Patterns to Avoid

- DO NOT import `src/server/` modules in client components (except Server Actions)
- DO NOT use `useSearchParams()` in page.tsx — use `searchParams` prop
- DO NOT create API routes (`route.ts`)
- DO NOT use `new Date()` in client code — use `date-fns` functions
- DO NOT format numbers in components — use `src/lib/formatting.ts`
- DO NOT put business logic in page.tsx — it's a thin orchestrator
- DO NOT use `useEffect` to fetch data — Server Components handle reads
- DO NOT create barrel files

### Project Structure Notes

All paths align with the established project structure:

```
src/
├── app/page.tsx                              # MODIFY: add controls bar, pass portfolios + timestamp
├── components/domain/
│   ├── controls-bar.tsx                      # NEW: client wrapper for controls
│   ├── portfolio-selector.tsx                # NEW: client component
│   ├── refresh-button.tsx                    # NEW: client component
│   ├── price-timestamp.tsx                   # NEW: client component
│   └── app-nav.tsx                           # MODIFY: carry ?portfolio= in tab links
├── server/queries/
│   ├── portfolios.ts                         # NEW: getUniquePortfolios()
│   └── market-data.ts                        # EXISTS: getLatestFetchTimestamp() ready to use
├── server/actions/market-data.ts             # EXISTS: refreshPrices(), refreshFxRates() ready to use
└── lib/formatting.ts                         # MODIFY: add formatTimestampDate()
```

### Previous Story Intelligence

**From Story 2.2 learnings:**
- better-sqlite3 queries are synchronous — no `await` needed for Drizzle queries (e.g., `getUniquePortfolios()`)
- `DashboardMetrics` is an async Server Component wrapped in Suspense — do not break this pattern
- `page.tsx` uses `searchParams: Promise<...>` and awaits it — follow same pattern
- `getTransactionCount()` is not portfolio-aware (deferred from 2.2 review) — not blocking for this story
- FX rates query fetches full history without dedup (deferred) — not blocking
- P&L zero is rendered in neutral color (fixed in 2.2 review)

**From Story 2.1 learnings:**
- FMP batch endpoints return HTTP 402 — individual calls with `Promise.all()` parallelization
- Console.error before returning generic error messages for diagnostics
- Server Actions follow orchestration pattern: query → service → write → revalidate → return ActionResult

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 2, Story 2.3]
- [Source: _bmad-output/planning-artifacts/architecture.md#Data Flow, Component Architecture, Frontend Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#PriceTimestamp, Portfolio Selector, Button Hierarchy, UX-DR4, UX-DR12, UX-DR13, UX-DR16, UX-DR20]
- [Source: _bmad-output/planning-artifacts/prd.md#FR2, FR3, FR4, FR50, FR51, FR52]
- [Source: _bmad-output/implementation-artifacts/2-2-portfolio-dashboard-with-metric-cards-and-loading-states.md#Completion Notes, Review Findings]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Base UI Select (not Radix) requires `onValueChange` to accept `string | null` — fixed TS error
- `useSearchParams()` in AppNav required wrapping in `<Suspense>` in layout.tsx for static page generation
- `vi.mock` factory hoisting required `vi.hoisted()` for external mock variables in portfolios.test.ts

### Completion Notes List

- Implemented `getUniquePortfolios()` query using Drizzle `selectDistinct` with alphabetical ordering
- Created `PortfolioSelector` client component with Base UI Select, URL-driven state via `useRouter().push()`
- Created `PriceTimestamp` component with 4 states: normal, stale (amber), refreshing, error
- Created `RefreshButton` with secondary button styling, spinner on loading, disabled state
- Created `ControlsBar` wrapper managing shared refresh state, composing all three child components
- Updated `page.tsx` to query portfolios and timestamp, pass as props to ControlsBar above DashboardMetrics
- Updated `AppNav` to preserve `?portfolio=` search param across tab navigation using `useSearchParams()`
- Added `formatTimestampDate()` to formatting.ts for short "MMM d" date display
- Added Suspense boundary around AppNav in layout.tsx (required by Next.js for useSearchParams)
- Installed Shadcn Select component (Base UI variant)
- All 92 tests pass, lint clean, build succeeds

### Change Log

- Story 2.3 implementation complete (Date: 2026-04-07)

### File List

- src/server/queries/portfolios.ts (NEW)
- src/server/queries/portfolios.test.ts (NEW)
- src/components/domain/portfolio-selector.tsx (NEW)
- src/components/domain/price-timestamp.tsx (NEW)
- src/components/domain/refresh-button.tsx (NEW)
- src/components/domain/controls-bar.tsx (NEW)
- src/components/ui/select.tsx (NEW — Shadcn install)
- src/app/page.tsx (MODIFIED)
- src/app/layout.tsx (MODIFIED)
- src/components/domain/app-nav.tsx (MODIFIED)
- src/lib/formatting.ts (MODIFIED)
- src/lib/formatting.test.ts (MODIFIED)
