# Story 1.4: App Shell, Navigation, Formatting, and Empty States

Status: review

## Story

As a user,
I want to see the app with a header, tab navigation, and helpful empty states guiding me to import transactions,
So that I can navigate between views and understand where to start.

## Acceptance Criteria (BDD)

1. **Given** I open the app in Chrome **When** the page loads **Then** I see a fixed app header with the title "Personal Portfolio Tracker" **And** horizontal tab navigation with four tabs: Dashboard, Positions, Transactions, Import **And** the Dashboard tab is active by default (underline border + semibold text) [UX-DR1]

2. **Given** the app shell is rendered **When** I look at the page **Then** the page background is `zinc-100` (#f4f4f5) **And** content area has max-width 1400px, centered with 24px padding **And** card/table surfaces are white with subtle `shadow-sm` [UX-DR2]

3. **Given** I click any tab (Dashboard, Positions, Transactions, Import) **When** the view switches **Then** the clicked tab becomes active (underline + semibold) **And** the content area updates to show that view's page **And** navigation works without full page reload

4. **Given** no transactions exist in the database **When** I view the Dashboard page **Then** I see a centered empty state: "No positions yet. Import transactions to get started." with a primary button linking to the Import tab [UX-DR14]

5. **Given** no transactions exist **When** I view the Positions page **Then** I see an empty state: "No positions yet"

6. **Given** no transactions exist **When** I view the Transactions page **Then** I see an appropriate empty state message

7. **Given** the app renders any financial values **When** values are displayed **Then** currency values show `$` prefix, comma thousands separator, 2 decimal places, right-aligned **And** share counts show 1 decimal place, right-aligned **And** percentages show 1 decimal place with `%` suffix, right-aligned **And** positive P&L shows `emerald-600` color with `+` prefix **And** negative P&L shows `red-600` color with `-` prefix **And** all numeric columns use tabular figures (monospace digits) [UX-DR17]

8. **Given** the app renders any text **When** I examine the typography **Then** the font is Inter (Shadcn default) **And** page titles are 24px/semibold, table headers 13px/medium, table cells 14px/regular, timestamps 12px/regular [UX-DR19]

9. **Given** the app uses color **When** I examine the color system **Then** primary text is `zinc-900`, secondary text `zinc-500`, borders `zinc-200`, positive `emerald-600`, negative `red-600`, stale/warning `amber-500`, error `red-500` [UX-DR18] **And** table row height is 40px, section spacing is 32px, card gap is 16px [UX-DR24]

## Tasks / Subtasks

- [x] Task 1: Fix formatting utilities (AC: #7)
  - [x] 1.1 Rewrite `formatCurrency` — `$` prefix, comma thousands, 2dp (e.g., `"$8,650.00"`)
  - [x] 1.2 Rewrite `formatShares` — 1 decimal place (e.g., `"50.0"`)
  - [x] 1.3 Rewrite `formatPercent` — 1 decimal place with `%` suffix (e.g., `"21.5%"`)
  - [x] 1.4 Rewrite `formatPnL` — `+`/`-` prefix, `$`, comma thousands, 2dp (e.g., `"+$1,535.00"`)
  - [x] 1.5 Add `formatDate(date: string): string` using date-fns (display format TBD — `"MMM d, yyyy"`)
  - [x] 1.6 Write unit tests for all formatting functions in `src/lib/formatting.test.ts`
- [x] Task 2: Switch font from Geist to Inter (AC: #8)
  - [x] 2.1 Replace Geist/Geist_Mono imports in `layout.tsx` with Inter from `next/font/google`
  - [x] 2.2 Apply Inter as the single typeface via CSS variable
- [x] Task 3: Build root layout with header and tab navigation (AC: #1, #2, #3)
  - [x] 3.1 Create `src/components/domain/app-nav.tsx` — `'use client'` component using `usePathname()` for active tab detection
  - [x] 3.2 Rewrite `src/app/layout.tsx` — fixed header, app title, nav tabs, background, content shell
  - [x] 3.3 Tab links: `/` (Dashboard), `/positions`, `/transactions`, `/import`
  - [x] 3.4 Active tab: `font-weight: 500`, `color: zinc-900`, `border-bottom: 2px solid zinc-900`; inactive: `color: zinc-500`
  - [x] 3.5 Content shell: `max-w-[1400px] mx-auto px-6` on zinc-100 background
- [x] Task 4: Create page stubs with empty states (AC: #4, #5, #6)
  - [x] 4.1 Create `src/components/domain/empty-state.tsx` — reusable component (icon, message, optional action button)
  - [x] 4.2 Create `src/server/queries/transactions.ts` — `getTransactionCount(portfolio?: string)` using Drizzle
  - [x] 4.3 Rewrite `src/app/page.tsx` (Dashboard) — Server Component, check transaction count, show empty state or placeholder
  - [x] 4.4 Create `src/app/positions/page.tsx` — Server Component with empty state
  - [x] 4.5 Create `src/app/transactions/page.tsx` — Server Component with empty state
  - [x] 4.6 Create `src/app/import/page.tsx` — placeholder page (import wizard is Epic 5)
- [x] Task 5: Apply typography and color system (AC: #8, #9)
  - [x] 5.1 Verify/update `globals.css` color variables match UX spec palette
  - [x] 5.2 Apply tabular-nums via Tailwind (`font-variant-numeric: tabular-nums`) — add utility class or use `tabular-nums` in Tailwind config if needed
  - [x] 5.3 Ensure page titles use `text-2xl font-semibold` (24px/600), consistent across all pages

## Dev Notes

### CRITICAL: Next.js 16.2.2 Breaking Change

**`searchParams` is now `Promise<{...}>` and MUST be awaited.** The architecture doc examples are outdated. Correct pattern for this version:

```typescript
// CORRECT (Next.js 16.2.2)
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const { portfolio } = await searchParams
}

// WRONG (old pattern from architecture doc)
// export default async function Page({ searchParams }: { searchParams: { portfolio?: string } }) {
```

`params` in layouts is also `Promise<{...}>`. Always `await` before accessing.

Read local docs at `node_modules/next/dist/docs/01-app/` for any API you're unsure about.

### Formatting.ts — Current State vs Required

The existing `src/lib/formatting.ts` has 4 functions that ALL need rewriting:

| Function | Current Output | Required Output |
|---|---|---|
| `formatCurrency(8650)` | `"USD 8650.00"` | `"$8,650.00"` |
| `formatShares(50)` | `"50.0000"` | `"50.0"` |
| `formatPercent(21.5)` | `"21.50%"` | `"21.5%"` |
| `formatPnL(1535)` | `"+USD 1535.00"` | `"+$1,535.00"` |

Use `Intl.NumberFormat` for locale-aware formatting with comma separators. Do NOT use `toFixed()` + string concat.

```typescript
// Recommended approach
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function formatCurrency(value: number | null): string {
  if (value === null) return "N/A";
  return currencyFormatter.format(value);
}
```

Accept `null` and return `"N/A"` (FR52 graceful degradation). The `currency` parameter can be removed — all values are USD-denominated after FX conversion (Story 1.3).

### Font Switch: Geist to Inter

The current layout imports `Geist` and `Geist_Mono` from `next/font/google`. UX spec requires **Inter** (Shadcn default). Replace:

```typescript
// REMOVE
import { Geist, Geist_Mono } from "next/font/google";

// ADD
import { Inter } from "next/font/google";
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
```

Apply `inter.variable` to `<html>` and set `font-family: var(--font-inter)` in globals.css (or via Tailwind's `font-sans` override).

### Navigation Component Architecture

The **layout** is a Server Component — it cannot use hooks. The **tab navigation** needs `usePathname()` to detect the active tab, so it MUST be a Client Component.

```
src/app/layout.tsx (Server Component)
  └── src/components/domain/app-nav.tsx ('use client' — usePathname, Link)
```

**Tab structure:**
| Tab | Path | Active When |
|---|---|---|
| Dashboard | `/` | pathname === `"/"` |
| Positions | `/positions` | pathname === `"/positions"` |
| Transactions | `/transactions` | pathname.startsWith(`"/transactions"`) |
| Import | `/import` | pathname === `"/import"` |

Transactions uses `startsWith` because drill-down from positions adds query params (`/transactions?ticker=AAPL&portfolio=IB`).

Use `next/link` for all tab links — client-side navigation, no full page reload.

**Portfolio selector is NOT in this story** — it belongs to Story 2.3. Do not implement it.

### Layout Structure

```
<html>
  <body class="min-h-full bg-zinc-100">
    <header class="bg-white border-b border-zinc-200 sticky top-0 z-10">
      <div class="max-w-[1400px] mx-auto px-6">
        <div class="flex items-center justify-between py-4">
          <h1 class="text-xl font-semibold text-zinc-900">Personal Portfolio Tracker</h1>
          <!-- Portfolio selector + refresh button will go here in Story 2.3 -->
        </div>
        <AppNav />  <!-- Client component: tab links -->
      </div>
    </header>
    <main class="max-w-[1400px] mx-auto px-6 py-8">
      {children}
    </main>
  </body>
</html>
```

**Tab styling (Tailwind classes):**
- Container: `flex gap-0 -mb-px` (negative margin for border overlap)
- Each tab: `px-5 py-2.5 text-sm border-b-2 transition-colors`
- Active: `border-zinc-900 text-zinc-900 font-medium`
- Inactive: `border-transparent text-zinc-500 hover:text-zinc-900`

Do NOT use Shadcn Tabs component — these are navigation links (`<Link>`), not tab panels. Shadcn Tabs manages content panels with JS; we need Next.js route-based navigation.

### Empty State Component

Create a reusable `EmptyState` component:

```typescript
// src/components/domain/empty-state.tsx
interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  actionHref?: string;
}
```

- Centered vertically and horizontally within the content area
- Text: `text-zinc-500 text-base`
- Action button: primary style (`bg-zinc-900 text-white`), links to `/import`
- Use `next/link` for the action button (not `<a>`)

**Empty state messages by page:**
| Page | Message | Action |
|---|---|---|
| Dashboard | "No positions yet. Import transactions to get started." | "Import Transactions" → `/import` |
| Positions | "No positions yet" | None |
| Transactions | "No transactions yet" | None |
| Import | N/A — always shows import UI (placeholder for now: "Import wizard coming soon") |

### Query: Transaction Count

Create `src/server/queries/transactions.ts`:

```typescript
import { db } from "@/server/db";
import { transactions } from "@/server/db/schema";
import { count } from "drizzle-orm";

export async function getTransactionCount(): Promise<number> {
  const result = db.select({ count: count() }).from(transactions).get();
  return result?.count ?? 0;
}
```

This is a **synchronous** call (better-sqlite3 is sync) but exported as a regular function. Called from Server Components during render.

Note: better-sqlite3 is synchronous — use `.get()` not `.then()`. Do NOT `await` Drizzle queries with better-sqlite3.

### Color System Verification

The UX spec defines these colors. Verify they're in `globals.css` CSS variables:

| Token | Tailwind | Hex | Usage |
|---|---|---|---|
| Primary text | `zinc-900` | #18181b | Headings, values, key data |
| Secondary text | `zinc-500` | #71717a | Labels, column headers, timestamps |
| Border | `zinc-200` | #e4e4e7 | Table borders, card edges |
| Page background | `zinc-100` | #f4f4f5 | Body background |
| Card surface | white | #ffffff | Card and table backgrounds |
| Positive P&L | `emerald-600` | #059669 | Gains |
| Negative P&L | `red-600` | #dc2626 | Losses |
| Stale/Warning | `amber-500` | #f59e0b | Stale indicators |
| Error | `red-500` | #ef4444 | Validation errors |

These are standard Tailwind colors — no custom CSS variables needed. Use Tailwind utility classes directly (e.g., `text-emerald-600`, `bg-zinc-100`).

### Typography Scale (Tailwind Classes)

| Element | Size | Weight | Tailwind |
|---|---|---|---|
| App title | 20px | 600 | `text-xl font-semibold` |
| Page title | 24px | 600 | `text-2xl font-semibold` |
| Metric value | 28px | 700 | `text-[28px] font-bold` (future — Story 2.2) |
| Metric label | 13px | 400 | `text-[13px]` |
| Table header | 13px | 500 | `text-[13px] font-medium` |
| Table body | 14px | 400 | `text-sm` |
| Timestamp | 12px | 400 | `text-xs` |
| Tab | 14px | varies | `text-sm` + `font-medium` (active) |

### Tabular Figures

All numeric displays must use `font-variant-numeric: tabular-nums` so columns of numbers align vertically. Apply via:

```css
/* In globals.css or as a Tailwind utility */
.tabular-nums { font-variant-numeric: tabular-nums; }
```

Or use Tailwind's built-in `tabular-nums` class directly on numeric containers.

### Spacing Constants

| Element | Value | Tailwind |
|---|---|---|
| Page padding | 24px | `px-6` |
| Content top padding | 32px | `py-8` |
| Section spacing | 32px | `mb-8` or `space-y-8` |
| Card gap | 16px | `gap-4` |
| Table row height | 40px | `h-10` |

### What NOT to Build

This story creates the **shell and stubs only**. Do NOT implement:
- Portfolio selector (Story 2.3)
- Refresh button / price timestamp (Story 2.3)
- Metric cards or dashboard data (Story 2.2)
- Position tables (Story 3.1)
- Transaction table (Story 4.1)
- Import wizard (Story 5.1)
- Any Server Actions
- Any market data / FMP integration

Pages should only check for transactions and show empty states or minimal placeholder content.

### Project Structure Notes

Files to CREATE:
```
src/components/domain/app-nav.tsx       (Client Component — tab navigation)
src/components/domain/empty-state.tsx   (Server Component — reusable empty state)
src/server/queries/transactions.ts      (getTransactionCount)
src/app/positions/page.tsx              (Positions stub)
src/app/transactions/page.tsx           (Transactions stub)
src/app/import/page.tsx                 (Import stub)
src/lib/formatting.test.ts             (Unit tests)
```

Files to MODIFY:
```
src/app/layout.tsx                      (Complete rewrite — header, nav, shell)
src/app/page.tsx                        (Complete rewrite — dashboard empty state)
src/lib/formatting.ts                   (Rewrite all 4 functions)
src/app/globals.css                     (Verify/add tabular-nums, Inter font-family)
```

Files to NOT TOUCH:
```
src/server/services/computation.ts      (Stories 1.2/1.3 — done)
src/server/services/computation.test.ts (Stories 1.2/1.3 — done)
src/server/db/schema.ts                 (Story 1.1 — done)
src/server/db/seed.ts                   (Story 1.1 — done)
src/server/types/*                      (Stories 1.1-1.3 — done)
src/server/config.ts                    (Story 1.1 — done)
src/components/ui/button.tsx            (Shadcn managed)
```

### Previous Story Intelligence

**From Story 1.3:**
- `ComputedPosition` has nullable monetary fields (null when FX rate missing) — empty state pages don't need to worry about this yet, but formatting functions must accept `null` and return `"N/A"`
- All monetary values are USD-denominated after FX conversion — no need for multi-currency display formatting
- decimal.js is server-only — formatting.ts runs on server during SSR, so it can use `Intl.NumberFormat` (not decimal.js)
- Seed data has 3 portfolios: "US Growth", "UK Income", "EU Diversified" — useful for verifying empty states don't falsely trigger when data exists
- better-sqlite3 queries are synchronous — `.get()` returns immediately, do not `await`

**From Story 1.3 Code Review:**
- Deferred: Truthiness check on `Decimal(0)` — not relevant to this story
- Deferred: FX rate validation — not relevant to this story
- Pattern established: pure functions receive data as args, no DB imports in services

**From Git History (recent 5 commits):**
- Atomic seed with clean idempotent pattern (delete + reinsert within transaction)
- Tests co-located with source using `.test.ts` suffix
- Code review fixes applied as separate commits (good practice)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1, Story 1.4]
- [Source: _bmad-output/planning-artifacts/architecture.md — Project Structure, Frontend Architecture, Formatting]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — Color Palette, Typography, Spacing, Empty States, Navigation]
- [Source: _bmad-output/planning-artifacts/prd.md — FR2, FR47, FR52]
- [Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md — searchParams Promise type]
- [Source: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/layout.md — layout props]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

None — clean implementation with no blockers.

### Completion Notes List

- **Task 1:** Rewrote all 4 formatting functions using `Intl.NumberFormat` for locale-aware formatting. Added `formatDate` using date-fns `parseISO` + `format`. All functions accept `null` → `"N/A"`. Removed old `currency` parameter (all values are USD-denominated). Deleted outdated tests at `src/lib/__tests__/formatting.test.ts` and replaced with 24 comprehensive tests in `src/lib/formatting.test.ts`.
- **Task 2:** Replaced Geist/Geist_Mono with Inter from `next/font/google`. Updated `--font-sans` CSS variable to reference `--font-inter`.
- **Task 3:** Created `app-nav.tsx` client component with `usePathname()` for active tab detection. Transactions tab uses `startsWith` for drill-down compatibility. Rewrote `layout.tsx` with sticky header, app title, nav tabs, and `max-w-[1400px]` content shell on `bg-zinc-100`.
- **Task 4:** Created reusable `EmptyState` component with optional action button. Created `getTransactionCount()` query (sync, uses `.get()`). Rewrote dashboard page with empty state conditional. Created positions, transactions, and import page stubs. All pages are Server Components.
- **Task 5:** Colors use standard Tailwind utilities directly (zinc-*, emerald-600, red-600, amber-500). `tabular-nums` is a built-in Tailwind v4 utility. All page titles use `text-2xl font-semibold text-zinc-900`.

### Change Log

- 2026-04-07: Implemented Story 1.4 — app shell, navigation, formatting, and empty states. All 5 tasks complete. 24 new unit tests, 64 total tests passing. Build and lint clean.

### File List

**Created:**
- `src/components/domain/app-nav.tsx` — Client component for tab navigation
- `src/components/domain/empty-state.tsx` — Reusable empty state component
- `src/server/queries/transactions.ts` — `getTransactionCount()` query
- `src/app/positions/page.tsx` — Positions page stub
- `src/app/transactions/page.tsx` — Transactions page stub
- `src/app/import/page.tsx` — Import page stub
- `src/lib/formatting.test.ts` — 24 unit tests for formatting functions

**Modified:**
- `src/lib/formatting.ts` — Rewrote all formatters with Intl.NumberFormat, added formatDate
- `src/app/layout.tsx` — Complete rewrite: Inter font, header, nav, content shell
- `src/app/page.tsx` — Complete rewrite: dashboard with empty state
- `src/app/globals.css` — Updated font-sans/font-mono CSS vars to use Inter

**Deleted:**
- `src/lib/__tests__/formatting.test.ts` — Replaced by co-located test file
