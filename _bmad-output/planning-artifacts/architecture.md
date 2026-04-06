---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-04-05'
inputDocuments:
  - prd.md
  - product-brief-personal-portfolio.md
  - product-brief-personal-portfolio-distillate.md
  - ux-design-specification.md
workflowType: 'architecture'
project_name: 'Personal Portfolio'
user_name: 'Maksim'
date: '2026-04-04'
---

# Architecture Decision Document — Personal Portfolio Tracker

## Project Context

### Requirements Summary

54 FRs across 8 groups. The architectural center of gravity is the **position computation engine** (FR31-42) — it's referenced by every other FR group. The transaction ledger is the single source of truth; positions, aggregates, and dashboard metrics are all derived state. The import subsystem (FR20-30) is the second most complex area.

**Non-Functional Requirements:**
- **Performance:** 2s render/compute for 1400+ transactions. 1s edit recompute. 5s import validation.
- **Accuracy:** Zero-tolerance — computed values must exactly match broker statements. Full precision stored, display-only rounding.
- **Integration:** FMP API only. Graceful degradation on unreachability.

### Technical Constraints

- Localhost deployment (future VPS) — no cloud, no auth for MVP
- Single user — no concurrency, no multi-tenancy
- Chrome-only, desktop-only (min 1280px)
- FMP API (paid) — sole external dependency, no abstraction layer
- Excel import only — no broker APIs in MVP
- Weighted average cost only — FIFO/specific lot deferred
- USD base currency

### Cross-Cutting Concerns

1. **Computation integrity** — transaction ledger → derived positions → derived aggregates. No stale or partial state.
2. **FX date-matching** — trade-date for cost basis, price-date for market value, payment-date for dividends. Fallback to most recent previous available rate.
3. **Recomputation cascade** — edits, adds, deletes, and imports all trigger full recomputation via `revalidatePath`.
4. **Data precision** — full precision in storage/computation via `decimal.js`, display-only rounding via `formatting.ts`.
5. **Atomic operations** — all-or-nothing imports, negative position flagging on destructive edits.

## Technology Stack

### Selected: Next.js (App Router)

**Rationale:** The project extends well beyond MVP (IRR, AI analysis, benchmarking, VPS deployment). Next.js provides an integrated server/client model, Server Actions eliminate API boilerplate, and single-process deployment (`next start`) simplifies VPS hosting. Chosen over Vite+Hono (two codebases to maintain) and T3 Stack (Prisma's SQLite limitations).

**Initialization:**

```bash
npx create-next-app@latest personal-portfolio --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"
npx shadcn@latest init
```

**Post-Init Libraries:**

```bash
# Database
npm install drizzle-orm better-sqlite3
npm install -D drizzle-kit @types/better-sqlite3

# Testing
npm install -D vitest @testing-library/react @testing-library/jest-dom

# Data tables (per UX spec)
npm install @tanstack/react-table

# Validation (shared client/server)
npm install zod

# Excel import/export (MVP-critical for FR20-27)
npm install exceljs

# Date handling (FX date-matching, transaction dates)
npm install date-fns

# Financial precision (zero-tolerance calculation accuracy)
npm install decimal.js
```

### Stack Summary

| Layer | Choice | Rationale |
|---|---|---|
| Framework | Next.js App Router | Integrated server/client, scales with features, simple VPS deploy |
| Language | TypeScript (strict) | Type safety across server and client |
| Runtime | Node.js only (no Edge) | Required for SQLite native bindings |
| Database | SQLite + better-sqlite3 | File-based, zero infrastructure, sufficient for single-user |
| ORM | Drizzle ORM | Lightweight, type-safe, excellent SQLite support |
| UI Components | Shadcn/ui + TanStack Table | Per UX spec — data tables with sort/filter/inline edit |
| Styling | Tailwind CSS | Per UX spec — utility-first, configured by create-next-app |
| Testing | Vitest | Vite-native, fast, shares config |
| Validation | Zod | Shared client/server schemas |
| Financial Math | decimal.js (server-only) | JavaScript floats cannot meet zero-tolerance accuracy |
| Excel | ExcelJS | MIT-licensed, server-side parsing |
| Dates | date-fns | Lightweight, tree-shakeable, timezone-safe |

## Core Architectural Decisions

### Decision Priority

**Critical (block implementation):**
- Compute positions on read — no cached position snapshots
- Historical market data table — permanent time-series, not session cache
- Server Components for reads + Server Actions for writes
- decimal.js for all financial arithmetic (server-side only)
- Server-side Excel parsing via FormData upload

**Important (shape architecture):**
- FMP service layer extracted for testability
- URL search params for portfolio/filter state persistence
- Seed script for development data

**Deferred (post-MVP):**
- Authentication (NextAuth.js via middleware, no DB in middleware)
- VPS deployment (Nginx + PM2)
- Daily portfolio snapshots (for charts/period returns — additive table)

### Data Architecture

**Position Computation: Compute on Read**
Positions are computed from the transaction ledger on every request. No position snapshot table. At ~1400 transactions, SQLite computes in milliseconds. The transaction ledger is the only source of truth.

**Historical Market Data Table**
Prices and FX rates stored permanently with date/timestamp. Not a cache — a growing time-series for future charts, period returns, and benchmarking. FMP fetches append records; historical entries never overwritten.

**Nullable Price-Dependent Fields**
Computation service returns `null` for market value, P&L, and weight when no price exists. UI displays "N/A" per FR52.

**Migration Strategy**
`drizzle-kit push` during early dev. Switch to `drizzle-kit generate` + `drizzle-kit migrate` once schema stabilizes, before VPS deployment.

### Data Flow

**Two-Pattern Architecture:**

```
READ PATH (page load):
Browser → Page component (Server Component)
  → Query function (src/server/queries/) → Drizzle → SQLite
  → Computation service (pure functions, receives data as args)
  → Formatting module (creates display strings)
  → Domain component (receives prepared props) → HTML response

WRITE PATH (user mutation):
User action → Client component calls Server Action
  → Zod validation → Drizzle mutation → SQLite
  → revalidatePath('/', 'layout') → triggers read path
  → ActionResult returned to client

MARKET DATA FLOW:
Refresh button → refreshPrices() + refreshFxRates() in parallel
  → Server Actions → FMP service (HTTP) → external FMP API
  → Write to market_data table → revalidatePath('/', 'layout')
```

**Key rules:**
- Server Actions never return computed data — they return `ActionResult` confirming write success/failure
- Fresh computed data arrives via Server Component re-render after revalidation
- `revalidatePath('/', 'layout')` revalidates all pages (root layout scope)

**ActionResult Pattern:**
```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string; fieldErrors?: Record<string, string>; rowErrors?: Array<{ row: number; field: string; message: string }> }
```

### FMP API Integration

FMP service layer (`src/server/services/fmp.ts`) contains all HTTP logic as pure, framework-agnostic functions. Server Actions orchestrate: call service → write to market data table → revalidate. Two separate actions (`refreshPrices`, `refreshFxRates`) for independent failure modes. Batch stock quotes to minimize API calls.

### Frontend Architecture

**State Management:** Server Components + `revalidatePath`. No client-side data fetching library.

Client-side state limited to:
- Import wizard: `useReducer` with state shape `{ step, file, parsedRows, validationErrors, duplicates, confirmedRows }`
- Inline edit: `useState` for immediate cell feedback alongside Server Action persistence

**Portfolio Selector:** URL search parameter `?portfolio=` persisted across tabs. Layout includes param in all tab `<Link>` hrefs. Default absent = aggregate view.

**Position Drill-Down:** `<Link href="/transactions?ticker=AAPL&portfolio=IB">`. Transactions page reads `searchParams` prop.

**Data to Client:** Raw numbers (for sorting) + formatted display strings. decimal.js computes on server, `.toNumber()` for client. At 2dp display precision, JavaScript numbers are exact.

**Server-Side Excel Parsing:** File uploaded as FormData to Server Action. Parsing (exceljs) + validation + duplicate detection in a single action.

### Authentication & Security

**MVP:** No authentication (localhost, single user).
**Future:** NextAuth.js with middleware session validation only (no DB in middleware). Authorization in Server Actions.
**Input validation:** Zod schemas on every Server Action, shared with client forms.

### Infrastructure & Deployment

**MVP:** `npm run dev` (Next.js + Turbopack). Single command.

**Future VPS:** `next build && next start`, Nginx + Let's Encrypt, PM2/systemd. SQLite at persistent path.

**Environment:**
- `.env.local` — FMP key (gitignored). Accessed via `src/server/config.ts` only.
- `.env.example` — template (committed)
- `.env.test` — mocked FMP, SQLite in-memory

## Project Structure

```
personal-portfolio/
├── .env.local                  # FMP_API_KEY (gitignored)
├── .env.example                # Template with required vars (committed)
├── .env.test                   # Test env config (gitignored)
├── .gitignore
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── drizzle.config.ts           # Drizzle Kit configuration
├── vitest.config.ts            # Vitest configuration
├── package.json
├── components.json             # Shadcn/ui configuration
├── data/
│   └── portfolio.db            # SQLite database (gitignored)
├── drizzle/                    # Generated migration files (when using generate+migrate)
├── public/
│   └── template.xlsx           # Downloadable Excel import template
├── src/
│   ├── app/
│   │   ├── globals.css         # Tailwind base + Shadcn CSS variables
│   │   ├── layout.tsx          # App shell: header, tabs, portfolio selector, refresh, timestamp
│   │   ├── page.tsx            # Dashboard: metric cards, positions summary
│   │   ├── positions/
│   │   │   └── page.tsx        # Active + closed positions tables
│   │   ├── transactions/
│   │   │   └── page.tsx        # Filterable/sortable ledger with inline editing
│   │   └── import/
│   │       └── page.tsx        # Multi-step import wizard
│   ├── components/
│   │   ├── ui/                 # Shadcn/ui primitives (via npx shadcn add)
│   │   └── domain/             # App-specific composed components
│   │       ├── metric-card.tsx
│   │       ├── positions-table.tsx
│   │       ├── positions-columns.tsx
│   │       ├── closed-positions-table.tsx
│   │       ├── closed-positions-columns.tsx
│   │       ├── transactions-table.tsx
│   │       ├── transactions-columns.tsx
│   │       ├── editable-cell.tsx           # Client component
│   │       ├── import-wizard.tsx           # Client component (useReducer)
│   │       ├── import-validation-table.tsx
│   │       ├── import-duplicate-table.tsx
│   │       ├── portfolio-selector.tsx      # Client component
│   │       ├── refresh-button.tsx          # Client component
│   │       ├── price-timestamp.tsx
│   │       ├── empty-state.tsx
│   │       └── delete-confirmation.tsx     # Client component (dialog)
│   ├── shared/
│   │   └── schemas/            # Zod schemas (pure, no server imports — safe for client)
│   │       ├── transaction.ts
│   │       └── import.ts
│   ├── server/
│   │   ├── actions/            # Write operations (Server Actions)
│   │   │   ├── transactions.ts # updateTransaction, addTransaction, deleteTransaction, bulkDeleteTransactions
│   │   │   ├── import.ts       # validateImport, commitImport
│   │   │   └── market-data.ts  # refreshPrices, refreshFxRates
│   │   ├── queries/            # Read operations (called by Server Components during render)
│   │   │   ├── transactions.ts # getTransactions, getTransactionsByTicker
│   │   │   ├── positions.ts    # getComputedPositions, getClosedPositions
│   │   │   ├── dashboard.ts    # getDashboardMetrics
│   │   │   └── market-data.ts  # getLatestPrices, getLatestFxRates, getPriceTimestamp
│   │   ├── services/           # Pure business logic (no DB imports, receives data as args)
│   │   │   ├── computation.ts  # computePositions, computeAggregates
│   │   │   ├── computation.test.ts
│   │   │   ├── fmp.ts          # fetchStockPrices, fetchFxRates (HTTP to FMP API)
│   │   │   └── fmp.test.ts
│   │   ├── db/
│   │   │   ├── index.ts        # Drizzle client instance
│   │   │   ├── schema.ts       # Table definitions: transactions, market_data
│   │   │   └── seed.ts         # Idempotent seed: npm run seed (tsx)
│   │   ├── config.ts           # Typed env var access (only file that reads process.env)
│   │   └── types/
│   │       ├── action-result.ts
│   │       ├── positions.ts
│   │       └── market-data.ts
│   └── lib/
│       ├── utils.ts            # Shadcn cn() helper
│       └── formatting.ts       # formatCurrency, formatShares, formatPercent, formatPnL
```

### Architectural Boundaries

```
SERVER ONLY (never imported by client):
  src/server/*, decimal.js, better-sqlite3, drizzle-orm, exceljs

SHARED (importable by both):
  src/shared/schemas/* (pure Zod, no server imports)
  src/server/types/* (type definitions only, no runtime code)

DB ACCESS (restricted):
  src/server/queries/* (reads), src/server/actions/* (writes), src/server/db/seed.ts
  NOT: src/server/services/* (pure logic, receives data as args)

EXTERNAL:
  src/server/services/fmp.ts — only file making HTTP calls to FMP
  src/server/config.ts — only file reading process.env
```

### FR to Structure Mapping

| FR Group | Page | Query | Action | Components | Service |
|---|---|---|---|---|---|
| Dashboard (FR1-4) | `page.tsx` | `dashboard.ts` | — | `metric-card`, `price-timestamp` | `computeAggregates` |
| Positions (FR5-10) | `positions/page.tsx` | `positions.ts` | — | `positions-table`, `closed-positions-table` | `computePositions` |
| Transactions (FR11-19) | `transactions/page.tsx` | `transactions.ts` | `transactions.ts` | `transactions-table`, `editable-cell` | — |
| Import (FR20-30) | `import/page.tsx` | — | `import.ts` | `import-wizard`, validation/duplicate tables | — |
| Computation (FR31-42) | — | — | — | — | `computation.ts` + tests |
| FX (FR43-47) | — | `market-data.ts` | — | — | `computation.ts` |
| Market Data (FR48-52) | — | `market-data.ts` | `market-data.ts` | `refresh-button`, `price-timestamp` | `fmp.ts` |
| Aggregate (FR53-54) | `page.tsx` | `dashboard.ts` | — | `metric-card` | `computeAggregates` |

## Implementation Patterns

### Naming Conventions

**Database (Drizzle):** Tables `snake_case` plural (`transactions`, `market_data`). Columns `snake_case`. Foreign keys `{table_singular}_id`. Indexes `idx_{table}_{column}`. Enum values `snake_case`.

**TypeScript:** Files `kebab-case`. Components `PascalCase`. Functions/variables `camelCase`. Types `PascalCase`. Constants `UPPER_SNAKE_CASE`. Server Actions `camelCase` verb-first. Zod schemas `camelCase` + `Schema` suffix.

### Coding Patterns

**Server Action Structure** — every action follows this template:
```typescript
'use server'
export async function actionName(input: InputType): Promise<ActionResult<OutputType>> {
  // 1. Validate input with Zod
  // 2. Perform database operation(s)
  // 3. revalidatePath('/', 'layout')
  // 4. Return ActionResult
}
```

**Computation Service** — pure functions, no side effects, no DB imports:
```typescript
export function computePositions(transactions: Transaction[], marketData: MarketData[]): ComputedPosition[] {
  // All arithmetic via decimal.js
  // Returns structured data with raw numbers
}
```

**Page Components** — thin orchestrators only:
```typescript
export default async function PositionsPage({ searchParams }: { searchParams: { portfolio?: string } }) {
  const positions = await getPositions(searchParams.portfolio)
  return <PositionsTable data={positions} />
}
```
No business logic in pages. Read `searchParams` from props (not `useSearchParams()` hook).

**Client Component Boundaries** — Server Components by default. Add `'use client'` only for hooks, event handlers, or browser APIs. Boundary as low as possible.

**Server Action Invocation** — try/catch for infra only, ActionResult for business errors:
```typescript
try {
  const result = await updateTransaction(data)
  if (!result.success) { /* handle business error */ }
} catch (error) { /* handle network/infra error */ }
```

**TanStack Table Columns** — dedicated files (`positions-columns.tsx`, `transactions-columns.tsx`). Each exports `ColumnDef<T>[]` with `accessorKey` (raw number for sorting) and cell renderer (formatted display via `formatting.ts`).

**Data Shape for Tables** — domain components receive `{ value: number, display: string }` for all numeric fields. Components never import `formatting.ts` directly.

**Shadcn Usage** — import directly from `@/components/ui/`. No wrapping or re-exporting. `ui/` only modified by `npx shadcn add`.

### Format Patterns

**Dates:** Stored as ISO 8601 (`'2026-04-03'` dates, `'2026-04-03T16:00:00Z'` timestamps). Display via `date-fns`. Sort via string comparison. Arithmetic via `date-fns parseISO()`. Never use `new Date()`.

**Numbers:** Stored as `REAL`. Computed via `decimal.js`. Sent to client as `number` + formatted `string`. Display: currency `$8,650.00`, shares `50.0`, percentages `21.5%`, P&L `+$1,535.00` / `-$200.00`, unavailable `"N/A"`.

**Nulls:** Use `null`, never `undefined`. Empty arrays `[]`, never `null`. No empty strings as "no value".

### Process Patterns

**Error Handling:** Server Actions never throw. Zod errors → `fieldErrors` / `rowErrors`. FMP errors → descriptive message, never raw API response. Client: field errors below input, row errors on cells, action errors as inline banner (not toast/modal). Errors persist; success auto-dismisses (5s).

**Loading:** Shadcn `Skeleton` for pages, disabled + text for buttons, progress text for import. Always contextual, never global spinner.

**Validation:** Client-side Zod on submit (not keystroke). Server-side Zod at start of every action. Import: full batch in one pass, all errors together.

### Structure Patterns

**Tests:** Co-located with `.test.ts` suffix. E2E tests in top-level `e2e/` if added.

**One domain per file.** Multiple related exports OK (e.g., `transactions.ts` exports CRUD actions). No barrel files. No mixing unrelated domains.

**`src/lib/`:** Only `utils.ts` and `formatting.ts` for MVP. No ad-hoc utility files — every function has a domain home.

**Seed Script:** `npm run seed` (`tsx src/server/db/seed.ts`). Idempotent — clears and re-inserts. Covers: multi-currency (USD, GBP, EUR), all action types (buy, sell, dividend, fee), partial sells, closed positions, same ticker in different portfolios.

### Anti-Patterns (AI Agents Must NOT)

- Import from `src/server/` in client components or `src/shared/`
- Create API Route files (`route.ts`) — all server logic via Server Actions
- Use `try/catch` as primary error handling — check `ActionResult.success` first
- Use `undefined` where `null` is appropriate
- Format numbers in components — use `src/lib/formatting.ts`
- Perform financial arithmetic with JavaScript `number` — use `decimal.js` server-side
- Store derived/computed data in the database — compute on read
- Use `revalidatePath` without `'layout'` — always `revalidatePath('/', 'layout')`
- Use `new Date()` — use `date-fns`
- Use `useSearchParams()` in pages — use `searchParams` prop
- Create barrel files (`index.ts` re-exports)
- Put business logic in page components — pages are orchestrators
- Create generic utility files (`helpers.ts`, `common.ts`)
- Import `decimal.js` in client-side code

## Implementation Sequence

1. **Project init** — create-next-app + post-init libraries
2. **DB schema + Drizzle + seed script** — transactions table, market_data table, seed data loaded
3. **Computation engine + Vitest tests** — weighted avg cost, FX conversion, P&L, tested against seed data
4. **UI shell** — layout, tabs, navigation, empty states
5. **FMP Server Actions + market data table** — prices/FX fetched and stored permanently
6. **Dashboard + positions views** — computed data with real prices
7. **Transactions view** — inline editing, filtering, sorting, edit propagation
8. **Import wizard** — multi-step flow, validation, duplicate detection, atomic commit
9. **Manual transaction add + delete + bulk delete**

**Cross-Component Dependencies:**
- Computation service ← Drizzle schema, decimal.js, date-fns, market data
- Server Actions ← Zod schemas, FMP service
- Server Components ← queries, computation service, formatting module
- Client components ← Server Actions, Shadcn/ui, TanStack Table

**Development Scripts:**
```json
{
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "seed": "tsx src/server/db/seed.ts",
  "db:push": "drizzle-kit push",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "test": "vitest",
  "test:run": "vitest run",
  "lint": "next lint"
}
```

## Validation

**54/54 FRs covered.** All NFRs architecturally supported (compute on read for performance, decimal.js for accuracy, nullable fields for FMP degradation).

**Status: READY FOR IMPLEMENTATION**

First step: run the initialization command, then follow the implementation sequence above.
