# Story 1.1: Project Setup with Database and Seed Data

Status: ready-for-dev

## Story

As a developer,
I want the project scaffolded with all dependencies, database schema, and realistic seed data,
so that I have a working development environment with test data for all subsequent stories.

## Acceptance Criteria

1. **Given** the project does not yet exist **When** I run the initialization commands (`create-next-app`, `shadcn init`, `npm install` for all post-init libraries) **Then** the project starts successfully with `npm run dev` and serves the default Next.js page, TypeScript strict mode is enabled, Tailwind CSS is configured, ESLint is set up.

2. **Given** the project is initialized **When** I define the Drizzle schema in `src/server/db/schema.ts` **Then** a `transactions` table exists with columns: `id`, `date` (ISO 8601 string), `ticker`, `action` (buy/sell/dividend/fee), `quantity` (REAL), `price` (REAL), `fees` (REAL), `portfolio`, `currency` **And** a `market_data` table exists with columns: `id`, `symbol`, `type` (stock_price/fx_rate), `date`, `value` (REAL), `fetched_at` (ISO 8601 timestamp) **And** `drizzle-kit push` creates both tables in `data/portfolio.db`.

3. **Given** the schema is defined and pushed **When** I run `npm run seed` (via `tsx src/server/db/seed.ts`) **Then** the seed script clears existing data and inserts test transactions covering: USD, GBP, and EUR currencies; all four action types (buy, sell, dividend, fee); partial sells; at least one fully closed position; the same ticker held in two different portfolios **And** the seed script inserts sample market data (stock prices and FX rates) for the seed tickers **And** running `npm run seed` a second time produces identical results (idempotent).

4. **Given** the project is set up **When** I check the configuration files **Then** `drizzle.config.ts` points to `data/portfolio.db`, `vitest.config.ts` is configured, `.env.example` contains `FMP_API_KEY=` placeholder (committed), `.env.local` is gitignored, `data/portfolio.db` is gitignored, `src/server/config.ts` is the only file reading `process.env`, and `package.json` includes scripts: dev, build, start, seed, db:push, test, test:run, lint.

## Tasks / Subtasks

- [ ] Task 1: Initialize Next.js project (AC: #1)
  - [ ] Run `npx create-next-app@latest personal-portfolio --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"`
  - [ ] Run `npx shadcn@latest init` (accept defaults — New York style, zinc base color)
  - [ ] Install production deps: `npm install drizzle-orm better-sqlite3 @tanstack/react-table zod exceljs date-fns decimal.js`
  - [ ] Install dev deps: `npm install -D drizzle-kit @types/better-sqlite3 vitest tsx`
  - [ ] Enable TypeScript strict mode in `tsconfig.json` (`"strict": true`)
  - [ ] Verify `npm run dev` serves the default page successfully

- [ ] Task 2: Create configuration files (AC: #4)
  - [ ] Create `drizzle.config.ts` — dialect `sqlite`, schema path `./src/server/db/schema.ts`, dbCredentials url `data/portfolio.db`
  - [ ] Create `vitest.config.ts` — configure path aliases to match `tsconfig.json`
  - [ ] Create `src/server/config.ts` — typed env var access (only file reading `process.env`)
  - [ ] Create `.env.example` with `FMP_API_KEY=` placeholder
  - [ ] Create `.env.local` with empty `FMP_API_KEY=`
  - [ ] Update `.gitignore` — add `data/portfolio.db`, `.env.local`, `.env.test`
  - [ ] Add `package.json` scripts: `seed`, `db:push`, `test`, `test:run`

- [ ] Task 3: Define database schema (AC: #2)
  - [ ] Create `src/server/db/schema.ts` with `transactions` and `market_data` tables
  - [ ] Create `src/server/db/index.ts` — Drizzle client singleton using better-sqlite3
  - [ ] Create `data/` directory (empty, gitignored except `.gitkeep` if needed)
  - [ ] Run `npx drizzle-kit push` to create tables in `data/portfolio.db`
  - [ ] Verify tables created with correct columns and types

- [ ] Task 4: Create seed script (AC: #3)
  - [ ] Create `src/server/db/seed.ts` — idempotent (clears + re-inserts)
  - [ ] Seed transactions: multi-currency (USD, GBP, EUR), all 4 action types, partial sells, closed position, same ticker in 2 portfolios
  - [ ] Seed market_data: stock prices for all seed tickers, FX rates for GBP and EUR
  - [ ] Verify `npm run seed` runs successfully and is idempotent (run twice, identical result)

- [ ] Task 5: Create shared utilities (AC: #4)
  - [ ] Create `src/lib/utils.ts` — Shadcn `cn()` helper (if not created by shadcn init)
  - [ ] Create `src/lib/formatting.ts` — stub exports: `formatCurrency`, `formatShares`, `formatPercent`, `formatPnL` (implementations come in Story 1.4)
  - [ ] Create `src/server/types/action-result.ts` — `ActionResult<T>` type definition

## Dev Notes

### Project Initialization Sequence

```bash
# 1. Scaffold
npx create-next-app@latest personal-portfolio --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"

# 2. Shadcn UI
npx shadcn@latest init

# 3. Production dependencies
npm install drizzle-orm better-sqlite3 @tanstack/react-table zod exceljs date-fns decimal.js

# 4. Dev dependencies
npm install -D drizzle-kit @types/better-sqlite3 vitest tsx
```

### Database Schema — Exact Column Definitions

**`transactions` table:**

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const transactions = sqliteTable("transactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  date: text("date").notNull(),                    // ISO 8601: "2026-03-15"
  ticker: text("ticker").notNull(),                // e.g., "AAPL", "VOD.L"
  action: text("action").$type<"buy" | "sell" | "dividend" | "fee">().notNull(),
  quantity: real("quantity").notNull(),             // full precision
  price: real("price").notNull(),                  // full precision
  fees: real("fees").notNull().default(0),          // default 0 when no fee
  portfolio: text("portfolio").notNull(),           // e.g., "Interactive Brokers"
  currency: text("currency").notNull(),             // ISO: "USD", "GBP", "EUR"
});
```

**`market_data` table:**

```typescript
export const marketData = sqliteTable("market_data", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  symbol: text("symbol").notNull(),                // "AAPL" or "GBPUSD"
  type: text("type").$type<"stock_price" | "fx_rate">().notNull(),
  date: text("date").notNull(),                    // ISO 8601: "2026-04-03"
  value: real("value").notNull(),                  // price or rate
  fetchedAt: text("fetched_at").notNull(),         // ISO 8601 timestamp
});
```

Add indexes on frequently queried columns:

```typescript
import { index } from "drizzle-orm/sqlite-core";
// In table definition third argument:
// transactions: index on (ticker, portfolio), index on (date)
// market_data: index on (symbol, type, date)
```

### Drizzle Client Initialization (`src/server/db/index.ts`)

```typescript
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const sqlite = new Database("data/portfolio.db");
export const db = drizzle(sqlite, { schema });
```

### Drizzle Config (`drizzle.config.ts`)

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/db/schema.ts",
  dbCredentials: {
    url: "data/portfolio.db",
  },
});
```

### Config Module (`src/server/config.ts`)

This is the **only** file that reads `process.env`. All other files import from here.

```typescript
export const config = {
  fmpApiKey: process.env.FMP_API_KEY ?? "",
};
```

### Vitest Config (`vitest.config.ts`)

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### ActionResult Type (`src/server/types/action-result.ts`)

```typescript
export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string };
```

### Seed Data Requirements

The seed script must be **idempotent** (clear all rows, then re-insert). Use `DELETE FROM` on both tables before inserting.

**Minimum seed scenarios:**

| Portfolio | Ticker | Currency | Actions Present | Special |
|-----------|--------|----------|----------------|---------|
| "US Growth" | AAPL | USD | buy, sell, dividend | Partial sell (still open) |
| "US Growth" | MSFT | USD | buy, dividend, fee | Standalone fee |
| "UK Income" | VOD.L | GBP | buy, sell, dividend | Fully closed position |
| "UK Income" | AAPL | USD | buy | Same ticker, different portfolio |
| "EU Diversified" | SAP.DE | EUR | buy, dividend | EUR currency |

**Market data seed:**
- Stock prices: one price per seed ticker (recent date)
- FX rates: GBPUSD and EURUSD for dates covering seed transactions + a recent date

**Seed script execution via `package.json`:**
```json
"seed": "tsx src/server/db/seed.ts"
```

### Package.json Scripts (Complete)

```json
{
  "dev": "next dev --turbopack",
  "build": "next build",
  "start": "next start",
  "seed": "tsx src/server/db/seed.ts",
  "db:push": "drizzle-kit push",
  "test": "vitest",
  "test:run": "vitest run",
  "lint": "next lint"
}
```

### .gitignore Additions

```
data/portfolio.db
.env.local
.env.test
```

### Project Structure Notes

After this story, the following paths must exist:

```
personal-portfolio/
├── drizzle.config.ts
├── vitest.config.ts
├── .env.example          # committed
├── .env.local            # gitignored
├── data/
│   └── portfolio.db      # gitignored, created by db:push
├── src/
│   ├── server/
│   │   ├── db/
│   │   │   ├── index.ts      # Drizzle client
│   │   │   ├── schema.ts     # Table definitions
│   │   │   └── seed.ts       # Idempotent seed
│   │   ├── config.ts         # Typed env access
│   │   └── types/
│   │       └── action-result.ts
│   ├── lib/
│   │   ├── utils.ts          # cn() helper
│   │   └── formatting.ts     # stub exports
│   └── shared/
│       └── schemas/          # empty dir, ready for Story 1.2+
```

### Architecture Compliance

- **No API route files** — Server Actions only (no `route.ts`)
- **No barrel files** — no `index.ts` re-exports anywhere
- **DB access restricted** to `src/server/queries/` and `src/server/actions/` (and `src/server/db/seed.ts` for seeding)
- **`src/server/config.ts`** is the sole `process.env` reader
- **decimal.js** is installed but NOT used in this story — it's for Story 1.2 (computation engine)
- **date-fns** is installed but NOT used in this story — it's for Story 1.2+
- **Naming**: tables `snake_case` plural, columns `snake_case`, FK pattern `{table_singular}_id`, files `kebab-case`, types `PascalCase`
- **Dates** stored as ISO 8601 text strings (`"2026-03-15"`), never JS Date objects
- **No Edge Runtime** — better-sqlite3 requires Node.js

### Anti-Patterns to Avoid

- Do NOT use `new Date()` — use date-fns when date logic is needed (not this story)
- Do NOT import `decimal.js` in client code
- Do NOT create `route.ts` API files
- Do NOT use `undefined` — use `null` for absent values
- Do NOT create barrel files (`index.ts` that re-exports)
- Do NOT put business logic in page components
- Do NOT store derived/computed data in the database
- Do NOT use JavaScript floats for financial arithmetic (relevant in Story 1.2)

### References

- [Source: _bmad-output/planning-artifacts/architecture.md — Tech Stack, Database Schema, Project Structure, AI Agent Prohibitions]
- [Source: _bmad-output/planning-artifacts/prd.md — FR31-FR47 (computation rules), FR47 (precision), Additional Requirements (init sequence)]
- [Source: _bmad-output/planning-artifacts/epics.md — Epic 1 Story 1.1 acceptance criteria]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md — UX-DR1-DR2 (layout), UX-DR14 (empty states)]
- [Source: Drizzle ORM docs — SQLite schema with `sqliteTable`, `real()`, `text().$type<>()`, better-sqlite3 client init, drizzle.config.ts with `defineConfig`]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
