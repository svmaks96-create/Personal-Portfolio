# Personal Portfolio Tracker

## Project Overview

A localhost web application for tracking investment positions across multiple brokerage accounts. Transactions are imported via Excel template, positions are computed from trade history using weighted average cost, and live prices/FX rates come from the FMP API. All values normalize to USD. Single user (Maksim), Chrome-only, desktop-only.

## Tech Stack

- **Framework:** Next.js App Router (TypeScript strict)
- **Database:** SQLite + better-sqlite3 + Drizzle ORM
- **UI:** Shadcn/ui + TanStack Table + Tailwind CSS
- **Validation:** Zod (shared client/server schemas)
- **Financial Math:** decimal.js (server-side only)
- **Excel:** ExcelJS (server-side)
- **Dates:** date-fns (never `new Date()`)
- **Testing:** Vitest (unit), Playwright (E2E)

## MCP Server Usage

### context7 - Documentation Lookups

Use context7 for **all** library/framework documentation lookups before answering questions or writing code involving:
- Next.js (App Router, Server Components, Server Actions, `revalidatePath`)
- Drizzle ORM (schema, queries, migrations)
- Shadcn/ui (component APIs, installation)
- TanStack Table (column definitions, sorting, filtering)
- Tailwind CSS (utility classes, configuration)
- Zod (schema definitions, validation)
- ExcelJS (parsing, formatting)
- date-fns (date manipulation, formatting)
- decimal.js (arithmetic operations)

**Always prefer context7 over training data** — docs may have changed since training cutoff.

### FMP (Financial Modeling Prep) - Market Data

FMP is the **sole external API** for this project. Use the FMP MCP server to:
- Look up stock quote endpoints and response shapes when building `src/server/services/fmp.ts`
- Verify FX rate endpoint parameters and available currency pairs
- Check batch quote capabilities to minimize API calls
- Test API responses during development to validate data shapes

**Key constraints:**
- All FMP calls go through `src/server/services/fmp.ts` — never call FMP from client code
- API key lives in `.env.local` as `FMP_API_KEY`, accessed only via `src/server/config.ts`
- Graceful degradation: display "N/A" when FMP is unreachable (FR52)
- Historical market data is stored permanently in `market_data` table (not a session cache)

### Playwright - E2E Testing & Visual Verification

Use Playwright MCP for:
- **E2E test development:** Writing and running browser tests for import flows, inline editing, position drill-down, portfolio selector
- **Visual verification:** After implementing UI changes, take screenshots to verify layout, table rendering, and responsive behavior at 1280px+ widths
- **Import flow testing:** Verify the multi-step wizard (upload -> validate -> correct -> review duplicates -> commit) works end-to-end
- **Computation verification:** Confirm that editing a transaction triggers visible recomputation in positions and dashboard

**When to use Playwright:**
- After completing any UI component or page
- After implementing the import wizard flow
- When verifying position-to-transaction drill-down navigation
- When testing inline edit -> recomputation cascade

E2E tests live in a top-level `e2e/` directory.

## Architecture Rules

### Data Flow

```
READ:  Server Component -> Query (src/server/queries/) -> Drizzle -> SQLite -> Computation Service -> Formatting -> Component
WRITE: Client Component -> Server Action -> Zod validation -> Drizzle mutation -> revalidatePath('/', 'layout')
```

- Positions are **computed on read** from the transaction ledger — no cached snapshots
- Server Actions return `ActionResult<T>` (success/failure), never computed data
- Fresh data arrives via Server Component re-render after revalidation
- Always use `revalidatePath('/', 'layout')` (root layout scope)

### Architectural Boundaries

```
SERVER ONLY:     src/server/*, decimal.js, better-sqlite3, drizzle-orm, exceljs
SHARED:          src/shared/schemas/* (pure Zod), src/server/types/* (type-only)
DB ACCESS:       src/server/queries/* (reads), src/server/actions/* (writes), src/server/db/seed.ts
EXTERNAL CALLS:  src/server/services/fmp.ts (only file making HTTP to FMP)
ENV ACCESS:      src/server/config.ts (only file reading process.env)
```

### Naming Conventions

- **DB:** Tables `snake_case` plural, columns `snake_case`, FKs `{table_singular}_id`
- **TypeScript:** Files `kebab-case`, components `PascalCase`, functions `camelCase`, types `PascalCase`, constants `UPPER_SNAKE_CASE`
- **Server Actions:** `camelCase` verb-first (e.g., `updateTransaction`)
- **Zod schemas:** `camelCase` + `Schema` suffix

### Coding Patterns

- Server Components by default; `'use client'` only for hooks/event handlers/browser APIs
- No API route files (`route.ts`) — all server logic via Server Actions
- `decimal.js` for all financial arithmetic (server-side only)
- `date-fns` for all date handling (never `new Date()`)
- Nullable price-dependent fields — return `null` when no price, UI shows "N/A"
- Domain components receive `{ value: number, display: string }` — never format in components
- URL search params (`?portfolio=`) for filter state persistence
- Shadcn components imported directly from `@/components/ui/` — no wrapping

### Anti-Patterns (DO NOT)

- Import from `src/server/` in client components
- Create API Route files
- Use `undefined` where `null` is appropriate
- Format numbers in components — use `src/lib/formatting.ts`
- Perform financial arithmetic with JavaScript `number`
- Store derived/computed data in the database
- Use `revalidatePath` without `'layout'`
- Use `useSearchParams()` in pages — use `searchParams` prop
- Create barrel files (`index.ts` re-exports)
- Put business logic in page components
- Import `decimal.js` in client-side code

## Project Structure

```
personal-portfolio/
├── src/
│   ├── app/           # Pages (thin orchestrators only)
│   ├── components/
│   │   ├── ui/        # Shadcn primitives (managed by npx shadcn add)
│   │   └── domain/    # App-specific composed components
│   ├── shared/
│   │   └── schemas/   # Zod schemas (safe for client import)
│   ├── server/
│   │   ├── actions/   # Server Actions (write operations)
│   │   ├── queries/   # Query functions (read operations)
│   │   ├── services/  # Pure business logic (computation.ts, fmp.ts)
│   │   ├── db/        # Drizzle client, schema, seed
│   │   ├── config.ts  # Typed env var access
│   │   └── types/     # Type definitions
│   └── lib/
│       ├── utils.ts       # Shadcn cn() helper
│       └── formatting.ts  # formatCurrency, formatShares, formatPercent, formatPnL
├── e2e/               # Playwright E2E tests
├── data/
│   └── portfolio.db   # SQLite database (gitignored)
└── public/
    └── template.xlsx  # Downloadable Excel import template
```

## Key Commands

```bash
npm run dev          # Next.js dev server with Turbopack
npm run seed         # Idempotent seed script (tsx)
npm run db:push      # Drizzle schema push (early dev)
npm run test         # Vitest watch mode
npm run test:run     # Vitest single run
npm run lint         # Next.js lint
```

## Planning Artifacts

Full requirements, architecture, UX specs, and epic breakdown are in:
`_bmad-output/planning-artifacts/`

@AGENTS.md
