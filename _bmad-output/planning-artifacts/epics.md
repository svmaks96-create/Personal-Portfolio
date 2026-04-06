---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
inputDocuments:
  - prd.md
  - architecture.md
  - ux-design-specification.md
---

# Personal Portfolio Tracker - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Personal Portfolio Tracker, decomposing the requirements from the PRD, UX Design, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: User can view aggregate portfolio metrics (total value, total cost basis, total P&L, cash returned) across all portfolios
FR2: User can select a specific portfolio or "All Portfolios" to view metrics in isolation or aggregate. "All Portfolios" is the default view on load, triggering the aggregate display behavior defined in FR51
FR3: User can see the timestamp of the last successful price and FX rate update
FR4: User can see when displayed price/FX data is stale
FR5: User can view all active positions with computed columns: average entry price, shares held, cost basis, current market value, last price, dividends received (net), sell proceeds, total P&L, position weight (%)
FR6: User can filter the active positions table by portfolio
FR7: User can view closed positions (fully divested) in a separate table showing average entry price, last price, total invested, total proceeds, dividends received (net), and realized P&L
FR8: User can filter the closed positions table by portfolio
FR9: User can sort the active and closed positions tables by any column
FR10: User can navigate from a position row to the transactions page, pre-filtered by that position's ticker and portfolio
FR11: User can view the complete transaction ledger
FR12: User can filter transactions by portfolio
FR13: User can filter transactions by ticker
FR14: User can sort the transaction ledger by any column
FR15: User can edit individual transaction fields inline
FR16: User can add a new transaction manually via the UI without importing from Excel
FR17: User can delete a transaction
FR18: User can select multiple transactions and delete them in a single bulk action
FR19: System recomputes all affected positions and aggregates when a transaction is edited, added, or deleted
FR20: User can download a standardized Excel template with required fields (date, ticker, action, quantity, price, fees, portfolio, currency)
FR21: User can upload a completed Excel file for import
FR22: System validates all rows for required fields and format correctness
FR23: System displays per-row validation errors with specific error descriptions
FR24: User can correct validation errors directly in the UI before import
FR25: System detects duplicate transactions across existing data and the import batch, defined as matching on: date, ticker, action, quantity, price, and portfolio
FR26: User can review flagged duplicates and override detection per row
FR27: System imports all validated rows atomically — no partial imports
FR28: System processes imported transactions in chronological order (by date) before applying validation rules including sell-more-than-held checks
FR29: System rejects negative values for quantity and price on buy, sell, and fee transactions. Negative amounts are only permitted for dividend action types (representing withholding tax)
FR30: Manual transaction add applies the same validation rules as import: required field checks, sell-more-than-held validation, negative value restrictions, and duplicate detection
FR31: System computes average entry price as (total cost of all purchases + standalone fees) / total shares purchased. Buy fees are added to the purchase cost (e.g., 100 shares at $10 with $5 fee = $1,005 cost)
FR32: System reduces cost basis proportionally using weighted average cost when shares are sold. Sell fees are deducted from sell proceeds
FR33: System accumulates dividends per position (net of withholding tax) and includes them in total P&L
FR34: System tracks sell proceeds separately per position
FR35: System computes total P&L as (current market value + total dividends received + total sell proceeds) - total amount invested
FR36: System computes current market value per position as shares held x last price, converted to USD using price-date FX rate
FR37: System computes cash returned as total dividends received + total sell proceeds across all positions (or per portfolio when filtered)
FR38: System identifies a position as a unique combination of ticker + portfolio. The same ticker held in different portfolios is tracked as separate positions
FR39: System supports four transaction action types: buy, sell, dividend, and fee
FR40: Standalone fee transactions increase the position's cost basis and average entry price, reducing total P&L
FR41: System validates that sell transactions do not exceed currently held shares during import and manual add. If a delete or edit creates a negative position, the system flags it visually as an invalid state for the user to resolve
FR42: System automatically removes a position when all its transactions are deleted. Positions exist only when at least one transaction references that ticker + portfolio combination
FR43: System converts cost basis to USD using trade-date FX rates
FR44: System converts current market value to USD using price-date FX rates
FR45: System converts dividend amounts to USD using payment-date FX rates
FR46: System falls back to the most recent previous available FX rate when no rate exists for a specific date
FR47: System stores and computes using full imported precision, rounding only at display (2 decimal places for dollar values, 1 for shares, 1 for percentages)
FR48: System fetches current stock prices from FMP API on demand
FR49: System fetches FX rates from FMP API on demand
FR50: User can trigger a manual refresh of stock prices and FX rates via a refresh button
FR51: System caches API responses within a session to avoid redundant calls
FR52: System displays N/A for price-dependent values when FMP returns no price for a ticker (delisted, invalid symbol, or API error)
FR53: When viewing the aggregate (all portfolios) view, positions with the same ticker across different portfolios are combined into a single row showing merged metrics for display purposes only; underlying data remains tracked per portfolio
FR54: User can see each active position's weight as a percentage of total portfolio value, displayed to 1 decimal place

### NonFunctional Requirements

NFR1: Any view (dashboard, positions, transactions) loads and renders within 2 seconds with a full dataset of 1400+ transactions
NFR2: Position computation (weighted average cost, P&L, FX conversions) for the entire portfolio completes within 2 seconds
NFR3: Import validation and duplicate detection for a 1400+ row batch completes within 5 seconds
NFR4: Transaction edit, add, or delete triggers recomputation and UI update within 1 second
NFR5: Manual price/FX refresh completes within 5 seconds (dependent on FMP API response time)
NFR6: FMP API is the sole external dependency (paid subscription, no rate-limiting handling). Graceful degradation on FMP unreachability per FR3, FR4, FR52

### Additional Requirements

- Architecture specifies a greenfield starter template: `npx create-next-app@latest personal-portfolio --typescript --tailwind --eslint --app --src-dir --import-alias "@/*"` followed by `npx shadcn@latest init` and post-init library installs (drizzle-orm, better-sqlite3, vitest, @tanstack/react-table, zod, exceljs, date-fns, decimal.js)
- SQLite database with Drizzle ORM — two tables: transactions, market_data. Schema push via `drizzle-kit push` during early dev
- Position computation is compute-on-read (no cached position snapshots) — positions derived from transaction ledger on every request
- Historical market data table stores prices and FX rates permanently as a growing time-series (not a session cache)
- decimal.js required for all financial arithmetic (server-side only) — JavaScript floats cannot meet zero-tolerance accuracy
- Server Components for reads + Server Actions for writes — no API route files
- ActionResult pattern for all Server Action returns (success/failure with typed data or error messages)
- FMP service layer extracted as pure functions in `src/server/services/fmp.ts` for testability
- URL search params (`?portfolio=`) for portfolio/filter state persistence across tabs
- Idempotent seed script (`npm run seed` via tsx) covering multi-currency, all action types, partial sells, closed positions, same ticker in different portfolios
- Zod validation on every Server Action, shared schemas between client and server via `src/shared/schemas/`
- `revalidatePath('/', 'layout')` after every write operation to trigger full recomputation cascade
- Nullable price-dependent fields — computation returns `null` when no price exists, UI shows "N/A"
- Architectural boundaries enforced: server-only code never imported by client, `decimal.js` never in client code, DB access restricted to queries/ and actions/ directories
- Implementation sequence: project init → DB schema + seed → computation engine + tests → UI shell → FMP actions → dashboard + positions → transactions → import → manual add/delete

### UX Design Requirements

UX-DR1: App shell uses Direction C (Top Tabs) — fixed app header with app title "Personal Portfolio Tracker" and horizontal tab navigation (Dashboard | Positions | Transactions | Import). Active tab indicated by underline border and semibold text
UX-DR2: Grey page background (`zinc-100` / #f4f4f5) with white card/table surfaces and subtle box shadows (`shadow-sm`). Content max-width 1400px, centered, 24px page padding
UX-DR3: MetricCard component — displays label, value, and optional positive/negative P&L coloring. 4-card grid row at top of dashboard (Total Value, Cost Basis, Total P&L, Cash Returned). States: default, loading (skeleton), stale (amber border)
UX-DR4: PriceTimestamp component — displays "Prices as of [date] [market] close" with two states: current (default text color) and stale (amber text + amber dot indicator). Positioned inline with portfolio selector and refresh button
UX-DR5: PositionsTable component (active) — TanStack Table with columns: Ticker, Portfolio, Shares, Avg Entry, Last Price, Cost Basis, Market Value, Dividends, Sell Proceeds, P&L, Weight%. Full-row click for drill-down (pointer cursor, hover highlight on `zinc-100`). Default sort by market value descending
UX-DR6: PositionsTable component (closed) — separate table below active positions showing: Ticker, Portfolio, Avg Entry, Last Price, Total Invested, Total Proceeds, Dividends, Realized P&L
UX-DR7: TransactionsTable component — TanStack Table with inline cell editing (click cell → input appears → Enter/Tab saves → Escape cancels). Columns: Date, Ticker, Action, Quantity, Price, Fees, Portfolio, Currency. Row selection via checkbox column for bulk delete. Default sort by date descending
UX-DR8: Inline editing interaction pattern — click cell → cell becomes input with current value selected → cell border changes to `zinc-900` → Enter/Tab saves and triggers recomputation → Escape reverts → brief subtle highlight after save to confirm change
UX-DR9: Add Transaction as inline row at top of transactions table (not a modal) — same fields as import template, "Save" button at end of row, "Cancel" as ghost button, same validation rules as import
UX-DR10: ImportWizard component — 4-step guided flow: (1) Upload with drag-and-drop zone + file picker + download template link, (2) Validation with per-row error display and inline correction, (3) Duplicate review with skip/override toggle per row, (4) Confirm with final row count and "Import" button. Each step as a distinct phase with clear progression
UX-DR11: Import error correction — inline editing in validation table, error cells have red border + error message below cell, correcting a value triggers immediate re-validation of that row
UX-DR12: Portfolio selector as dropdown in controls bar below tab navigation, persists across tab switches via URL search param `?portfolio=`. "All Portfolios" as default (absent param = aggregate)
UX-DR13: Refresh button (secondary style) triggers parallel price + FX refresh. Shows "Refreshing..." text replacing timestamp and spinner on button during refresh
UX-DR14: EmptyState component — centered message + primary CTA button. Variants: Dashboard ("No positions yet. Import transactions to get started." → Import tab), Positions ("No positions in [portfolio]"), Transactions ("No transactions for [ticker] in [portfolio]" + "Clear filters" link)
UX-DR15: Delete confirmation via Shadcn Dialog for single and bulk delete actions. Destructive button style (white background, `red-600` text + border)
UX-DR16: Button hierarchy — Primary (solid `zinc-900`, white text, max one per view), Secondary (white, `zinc-900` border), Destructive (white, `red-600` text + border, always with confirmation), Ghost (no border/background, text only)
UX-DR17: Number formatting across all tables — currency right-aligned with $ prefix, comma thousands, 2dp; shares right-aligned 1dp; percentages right-aligned 1dp with % suffix; positive P&L in `emerald-600` with + prefix; negative P&L in `red-600` with - prefix; tabular figures (monospace digits) on all numeric columns
UX-DR18: Color system — Background `zinc-50`, Card/Surface white, Primary text `zinc-900`, Secondary text `zinc-500`, Borders `zinc-200`, Positive P&L `emerald-600`, Negative P&L `red-600`, Stale/Warning `amber-500`, Error `red-500`, Interactive `zinc-900`, Hover `zinc-100`
UX-DR19: Typography — Inter font (Shadcn default). Page title 24px/semibold, Metric value 28px/bold, Metric label 13px/regular, Table header 13px/medium, Table cell 14px/regular, Timestamp 12px/regular
UX-DR20: Success feedback as inline banner (green-tinted background, auto-dismiss 5s). Error feedback inline per-row/per-cell (red text, persists until resolved). No modal alerts for non-destructive feedback. No toasts.
UX-DR21: Loading states — Shadcn Skeleton components matching layout for initial page load. Disabled button + text change for refresh. Progress text for import processing
UX-DR22: Table sorting — click column header for ascending, click again for descending, third click removes sort. Small arrow indicator next to header text
UX-DR23: Active filter display on Transactions page — text showing "Filtered by: [ticker] · [portfolio]" with "Clear" link
UX-DR24: Table row height 40px for spreadsheet-familiar density. Section spacing 32px between dashboard cards and positions table. Card gap 16px between metric cards
UX-DR25: Position drill-down navigation — clicking position row navigates to `/transactions?ticker=X&portfolio=Y`. Cursor pointer on hover, `zinc-100` hover background
UX-DR26: Invalid state handling — if edit/delete creates negative position, affected position row highlighted with amber background + warning icon (per FR41)

### FR Coverage Map

FR1: Epic 2 - View aggregate portfolio metrics on dashboard
FR2: Epic 2 - Portfolio selector with "All Portfolios" default
FR3: Epic 2 - Display timestamp of last price/FX update
FR4: Epic 2 - Display stale price/FX indicator
FR5: Epic 3 - View active positions with computed columns
FR6: Epic 3 - Filter active positions by portfolio
FR7: Epic 3 - View closed positions with realized P&L
FR8: Epic 3 - Filter closed positions by portfolio
FR9: Epic 3 - Sort positions tables by any column
FR10: Epic 3 - Navigate from position to filtered transactions
FR11: Epic 4 - View complete transaction ledger
FR12: Epic 4 - Filter transactions by portfolio
FR13: Epic 4 - Filter transactions by ticker
FR14: Epic 4 - Sort transaction ledger by any column
FR15: Epic 4 - Edit transaction fields inline
FR16: Epic 6 - Add transaction manually via UI
FR17: Epic 6 - Delete a transaction
FR18: Epic 6 - Bulk delete selected transactions
FR19: Epic 4 - Recompute positions/aggregates on transaction change
FR20: Epic 5 - Download standardized Excel template
FR21: Epic 5 - Upload Excel file for import
FR22: Epic 5 - Validate all rows for required fields and format
FR23: Epic 5 - Display per-row validation errors
FR24: Epic 5 - Correct validation errors in UI before import
FR25: Epic 5 - Detect duplicate transactions
FR26: Epic 5 - Review and override duplicates per row
FR27: Epic 5 - Atomic import (no partial imports)
FR28: Epic 5 - Process imports in chronological order
FR29: Epic 5 - Reject negative values (except dividend withholding)
FR30: Epic 6 - Manual add applies same validation as import
FR31: Epic 1 - Compute average entry price (weighted average cost)
FR32: Epic 1 - Reduce cost basis proportionally on sell
FR33: Epic 1 - Accumulate dividends per position (net of tax)
FR34: Epic 1 - Track sell proceeds per position
FR35: Epic 1 - Compute total P&L formula
FR36: Epic 1 - Compute market value with FX conversion
FR37: Epic 1 - Compute cash returned (dividends + sell proceeds)
FR38: Epic 1 - Position = unique ticker + portfolio combination
FR39: Epic 1 - Four action types: buy, sell, dividend, fee
FR40: Epic 1 - Standalone fees increase cost basis
FR41: Epic 1 - Validate sell does not exceed held shares
FR42: Epic 1 - Auto-remove position when all transactions deleted
FR43: Epic 1 - Convert cost basis using trade-date FX rates
FR44: Epic 1 - Convert market value using price-date FX rates
FR45: Epic 1 - Convert dividends using payment-date FX rates
FR46: Epic 1 - FX fallback to most recent previous rate
FR47: Epic 1 - Full precision storage, display-only rounding
FR48: Epic 2 - Fetch stock prices from FMP API on demand
FR49: Epic 2 - Fetch FX rates from FMP API on demand
FR50: Epic 2 - Manual refresh button for prices/FX
FR51: Epic 2 - Cache API responses within session
FR52: Epic 2 - Display N/A when no price available
FR53: Epic 2 - Aggregate view combines same-ticker positions
FR54: Epic 2 - Position weight as percentage of total value

## Epic List

### Epic 1: Project Foundation & Position Computation Engine
The app is running with a functioning navigation shell, database with seed data, and a verified computation engine that correctly derives positions from transactions. Empty states guide the user toward their first import.
**FRs covered:** FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR44, FR45, FR46, FR47
**UX-DRs:** UX-DR1, DR2, DR14, DR18, DR19, DR24
**Additional:** Starter template init, DB schema + Drizzle setup, seed script, computation engine with Vitest tests, decimal.js precision, UI shell with tabs and empty states

### Epic 2: Market Data & Portfolio Dashboard
User opens the app and sees their aggregate portfolio dashboard — total value, cost basis, P&L, cash returned. They can refresh live prices and FX rates, see data freshness timestamps, switch between portfolios, and see combined aggregate positions.
**FRs covered:** FR1, FR2, FR3, FR4, FR48, FR49, FR50, FR51, FR52, FR53, FR54
**UX-DRs:** UX-DR3, DR4, DR12, DR13, DR16, DR20, DR21

### Epic 3: Position Viewing & Drill-Down
User can view all active positions with 10+ computed columns, view closed positions with realized P&L, filter by portfolio, sort by any column, and click a position row to drill down to its transactions.
**FRs covered:** FR5, FR6, FR7, FR8, FR9, FR10
**UX-DRs:** UX-DR5, DR6, DR17, DR22, DR25, DR26

### Epic 4: Transaction Ledger & Inline Editing
User can view the complete transaction ledger, filter by portfolio and ticker, sort by any column, and edit any transaction inline with instant recomputation of all affected positions and aggregates.
**FRs covered:** FR11, FR12, FR13, FR14, FR15, FR19
**UX-DRs:** UX-DR7, DR8, DR23

### Epic 5: Transaction Import
User can download the Excel template, upload a filled file, go through guided multi-step validation with inline error correction, review and handle duplicate detection per row, and commit the import atomically.
**FRs covered:** FR20, FR21, FR22, FR23, FR24, FR25, FR26, FR27, FR28, FR29
**UX-DRs:** UX-DR10, DR11

### Epic 6: Manual Transaction Management
User can manually add a new transaction via an inline form, delete a single transaction with confirmation, and bulk delete selected transactions — all with the same validation rules as import.
**FRs covered:** FR16, FR17, FR18, FR30
**UX-DRs:** UX-DR9, DR15

## Epic 1: Project Foundation & Position Computation Engine

The app is running with a functioning navigation shell, database with seed data, and a verified computation engine that correctly derives positions from transactions. Empty states guide the user toward their first import.

### Story 1.1: Project Setup with Database and Seed Data

As a developer,
I want the project scaffolded with all dependencies, database schema, and realistic seed data,
So that I have a working development environment with test data for all subsequent stories.

**Acceptance Criteria:**

**Given** the project does not yet exist
**When** I run the initialization commands (`create-next-app`, `shadcn init`, `npm install` for all post-init libraries)
**Then** the project starts successfully with `npm run dev` and serves the default Next.js page
**And** TypeScript strict mode is enabled, Tailwind CSS is configured, ESLint is set up

**Given** the project is initialized
**When** I define the Drizzle schema in `src/server/db/schema.ts`
**Then** a `transactions` table exists with columns: id, date (ISO 8601 string), ticker, action (buy/sell/dividend/fee), quantity (REAL), price (REAL), fees (REAL), portfolio, currency
**And** a `market_data` table exists with columns: id, symbol, type (stock_price/fx_rate), date, value (REAL), fetched_at (ISO 8601 timestamp)
**And** `drizzle-kit push` creates both tables in `data/portfolio.db`

**Given** the schema is defined and pushed
**When** I run `npm run seed` (via `tsx src/server/db/seed.ts`)
**Then** the seed script clears existing data and inserts test transactions covering: USD, GBP, and EUR currencies; all four action types (buy, sell, dividend, fee); partial sells; at least one fully closed position; the same ticker held in two different portfolios
**And** the seed script inserts sample market data (stock prices and FX rates) for the seed tickers
**And** running `npm run seed` a second time produces identical results (idempotent)

**Given** the project is set up
**When** I check the configuration files
**Then** `drizzle.config.ts` points to `data/portfolio.db`
**And** `vitest.config.ts` is configured for the project
**And** `.env.example` contains `FMP_API_KEY=` placeholder (committed)
**And** `.env.local` is gitignored
**And** `data/portfolio.db` is gitignored
**And** `src/server/config.ts` is the only file reading `process.env`
**And** `package.json` includes scripts: dev, build, start, seed, db:push, test, test:run, lint

### Story 1.2: Core Position Computation Engine

As a developer,
I want positions computed from transactions using weighted average cost with correct handling of buys, sells, dividends, and fees,
So that all portfolio metrics are accurate and verifiable against broker statements.

**Acceptance Criteria:**

**Given** a set of buy transactions for a ticker in a single portfolio
**When** `computePositions` processes them
**Then** average entry price equals (total cost of all purchases + standalone fees) / total shares purchased, where buy fees are added to purchase cost (e.g., 100 shares at $10 with $5 fee = $1,005 cost, avg entry = $10.05)
**And** cost basis equals total cost of all purchases including fees
**And** shares held equals total shares purchased (FR31)

**Given** a position with shares held and a sell transaction
**When** `computePositions` processes the sell
**Then** cost basis is reduced proportionally using weighted average cost (sold shares / total shares * cost basis)
**And** sell fees are deducted from sell proceeds, not added to cost basis
**And** sell proceeds are tracked separately per position (FR32, FR34)

**Given** a position with dividend transactions (some with negative amounts for withholding tax)
**When** `computePositions` processes them
**Then** dividends are accumulated per position as the net sum (gross - withholding)
**And** dividend amounts are included in total P&L (FR33)

**Given** standalone fee transactions (not attached to a buy/sell)
**When** `computePositions` processes them
**Then** the fee increases the position's cost basis and average entry price (FR40)

**Given** a position with market data available
**When** computing total P&L
**Then** total P&L = (current market value + total dividends received + total sell proceeds) - total amount invested (FR35)
**And** current market value = shares held × last price (FR36)
**And** cash returned = total dividends received + total sell proceeds (FR37)

**Given** transactions for the same ticker in different portfolios
**When** `computePositions` processes them
**Then** each ticker + portfolio combination is tracked as a separate position (FR38)

**Given** a position where all shares have been sold
**When** `computePositions` processes the transactions
**Then** the position is identified as closed (shares held = 0) with realized P&L (FR42)

**Given** a sell transaction that would result in more shares sold than currently held (processing in chronological order)
**When** `computePositions` validates the transaction sequence
**Then** the system flags the invalid state (FR41)

**Given** all four action types exist in seed data
**When** `computePositions` processes them
**Then** buy, sell, dividend, and fee are all handled correctly per their respective rules (FR39)

**Given** the computation engine is implemented
**When** Vitest tests run against seed data
**Then** all tests pass, verifying weighted average cost, cost basis reduction on sell, dividend accumulation, fee impact, P&L calculations, and position identification
**And** all arithmetic uses `decimal.js` (no JavaScript float operations for financial math)
**And** computation functions are pure (no DB imports, receive data as arguments)

### Story 1.3: Multi-Currency FX Conversion

As a developer,
I want the computation engine to convert all values to USD using date-matched FX rates with fallback logic,
So that multi-currency portfolios compute correctly and match broker-reported USD equivalents.

**Acceptance Criteria:**

**Given** a buy transaction in a non-USD currency (e.g., GBP) with a trade date of 2026-03-15
**When** `computePositions` computes cost basis
**Then** the cost is converted to USD using the FX rate for 2026-03-15 (trade-date FX rate) (FR43)

**Given** a position with shares priced in a non-USD currency
**When** `computePositions` computes current market value
**Then** market value is converted to USD using the FX rate matching the price date (price-date FX rate) (FR44)

**Given** a dividend transaction in a non-USD currency with a payment date
**When** `computePositions` processes the dividend
**Then** the dividend amount is converted to USD using the payment-date FX rate (FR45)

**Given** no FX rate exists for a specific date (weekend, holiday, data gap)
**When** the computation engine looks up the FX rate
**Then** it falls back to the most recent previous available FX rate (FR46)
**And** this fallback behavior is documented as expected (not a defect)

**Given** transaction values with high precision (e.g., price = 142.3456)
**When** the computation engine processes them
**Then** full precision is maintained during storage and computation
**And** rounding occurs only at display time: 2 decimal places for dollar values, 1 for shares, 1 for percentages (FR47)

**Given** the seed data includes GBP and EUR transactions with corresponding FX rates
**When** Vitest tests run the multi-currency scenarios
**Then** all FX conversions produce correct USD values matching expected results
**And** fallback logic is tested with missing date scenarios
**And** precision is verified (no floating-point drift in intermediate calculations)

### Story 1.4: App Shell, Navigation, Formatting, and Empty States

As a user,
I want to see the app with a header, tab navigation, and helpful empty states guiding me to import transactions,
So that I can navigate between views and understand where to start.

**Acceptance Criteria:**

**Given** I open the app in Chrome
**When** the page loads
**Then** I see a fixed app header with the title "Personal Portfolio Tracker"
**And** horizontal tab navigation with four tabs: Dashboard, Positions, Transactions, Import
**And** the Dashboard tab is active by default (underline border + semibold text) (UX-DR1)

**Given** the app shell is rendered
**When** I look at the page
**Then** the page background is `zinc-100` (#f4f4f5)
**And** content area has max-width 1400px, centered with 24px padding
**And** card/table surfaces are white with subtle `shadow-sm` (UX-DR2)

**Given** I click any tab (Dashboard, Positions, Transactions, Import)
**When** the view switches
**Then** the clicked tab becomes active (underline + semibold)
**And** the content area updates to show that view's page
**And** navigation works without full page reload

**Given** no transactions exist in the database
**When** I view the Dashboard page
**Then** I see a centered empty state: "No positions yet. Import transactions to get started." with a primary button linking to the Import tab (UX-DR14)

**Given** no transactions exist
**When** I view the Positions page
**Then** I see an empty state: "No positions in [portfolio name]" (or "No positions yet" for aggregate)

**Given** no transactions exist
**When** I view the Transactions page
**Then** I see an appropriate empty state message

**Given** the app renders any financial values
**When** values are displayed
**Then** currency values show $ prefix, comma thousands separator, 2 decimal places, right-aligned
**And** share counts show 1 decimal place, right-aligned
**And** percentages show 1 decimal place with % suffix, right-aligned
**And** positive P&L shows `emerald-600` color with + prefix
**And** negative P&L shows `red-600` color with - prefix
**And** all numeric columns use tabular figures (monospace digits) (UX-DR17)

**Given** the app renders any text
**When** I examine the typography
**Then** the font is Inter (Shadcn default)
**And** page titles are 24px/semibold, table headers 13px/medium, table cells 14px/regular, timestamps 12px/regular (UX-DR19)

**Given** the app uses color
**When** I examine the color system
**Then** primary text is `zinc-900`, secondary text `zinc-500`, borders `zinc-200`, positive `emerald-600`, negative `red-600`, stale/warning `amber-500`, error `red-500` (UX-DR18)
**And** table row height is 40px, section spacing is 32px, card gap is 16px (UX-DR24)

## Epic 2: Market Data & Portfolio Dashboard

User opens the app and sees their aggregate portfolio dashboard — total value, cost basis, P&L, cash returned. They can refresh live prices and FX rates, see data freshness timestamps, switch between portfolios, and see combined aggregate positions.

### Story 2.1: FMP Service & Market Data Server Actions

As a developer,
I want the FMP API integration to fetch and persist stock prices and FX rates on demand,
So that the dashboard and positions views have current market data to compute valuations.

**Acceptance Criteria:**

**Given** the FMP API key is configured in `.env.local`
**When** the `refreshPrices` Server Action is called
**Then** it calls `fetchStockPrices` in `src/server/services/fmp.ts` with all unique tickers from the transactions table
**And** stock quotes are batched to minimize API calls
**And** results are written to the `market_data` table with type `stock_price`, the current date, and `fetched_at` timestamp
**And** `revalidatePath('/', 'layout')` is called to trigger re-render
**And** an `ActionResult` is returned (success with data or failure with descriptive error message) (FR48)

**Given** non-USD currencies exist in the transactions table
**When** the `refreshFxRates` Server Action is called
**Then** it calls `fetchFxRates` in `src/server/services/fmp.ts` for all unique non-USD currencies
**And** results are written to the `market_data` table with type `fx_rate`, the current date, and `fetched_at` timestamp
**And** `revalidatePath('/', 'layout')` is called
**And** an `ActionResult` is returned (FR49)

**Given** prices or FX rates have already been fetched for today's date
**When** a refresh action is called again within the same session
**Then** the system avoids redundant API calls if data for today already exists in `market_data` (FR51)

**Given** the FMP API is unreachable or returns an error
**When** a refresh action is called
**Then** the action returns `ActionResult` with `success: false` and a descriptive error message (never raw API response)
**And** existing market data in the table remains unchanged (graceful degradation)

**Given** the FMP service layer is implemented
**When** I examine the code
**Then** `src/server/services/fmp.ts` is the only file making HTTP calls to FMP
**And** FMP functions are pure (framework-agnostic, no DB imports)
**And** Server Actions orchestrate: call service → write to market_data → revalidate
**And** `refreshPrices` and `refreshFxRates` are separate actions for independent failure modes

### Story 2.2: Portfolio Dashboard with Metric Cards and Loading States

As a user,
I want to see my portfolio's total value, cost basis, P&L, and cash returned on the dashboard with proper loading states,
So that I get a complete financial overview the moment I open the app.

**Acceptance Criteria:**

**Given** transactions and market data exist in the database
**When** I open the app (Dashboard tab loads by default)
**Then** I see four MetricCard components in a grid row: Total Value, Cost Basis, Total P&L, Cash Returned
**And** metric values are displayed at 28px/bold with metric labels at 13px/regular
**And** Total P&L is colored `emerald-600` if positive or `red-600` if negative
**And** cards have white background with `shadow-sm` on the `zinc-100` page background
**And** card gap is 16px between cards (FR1, UX-DR3)

**Given** the dashboard is in aggregate "All Portfolios" mode (default)
**When** positions with the same ticker exist across different portfolios
**Then** the aggregate metrics combine those positions into merged values for display
**And** underlying data remains tracked per portfolio (FR53)

**Given** market data exists for positions
**When** the dashboard computes position weight
**Then** each position's weight is calculated as its market value / total portfolio market value, displayed to 1 decimal place with % suffix (FR54)

**Given** no price data exists for a ticker (delisted, invalid symbol, or FMP returned no data)
**When** the dashboard computes metrics
**Then** price-dependent values (market value, P&L, weight) display as "N/A" for that position
**And** aggregate totals exclude N/A positions from price-dependent sums (FR52)

**Given** the dashboard page is loading
**When** data is being fetched from the database
**Then** Shadcn Skeleton components matching the MetricCard layout are displayed
**And** skeletons match the card dimensions and grid layout (UX-DR21)

**Given** the dashboard query functions are implemented
**When** I examine the code
**Then** `getDashboardMetrics` in `src/server/queries/dashboard.ts` calls the computation engine
**And** the page component (`src/app/page.tsx`) is a thin Server Component orchestrator with no business logic

### Story 2.3: Portfolio Selector, Price Refresh, and Freshness Display

As a user,
I want to switch between portfolio views, refresh market data, and always know how current my prices are,
So that I can view any portfolio in isolation and trust the data freshness.

**Acceptance Criteria:**

**Given** the app is loaded
**When** I look at the controls bar below the tab navigation
**Then** I see a portfolio selector dropdown, a refresh button, and a price timestamp
**And** the portfolio selector defaults to "All Portfolios" (no `?portfolio=` param in URL)
**And** the dropdown lists all unique portfolio names from the transactions table (FR2, UX-DR12)

**Given** I select a specific portfolio from the dropdown
**When** the selection changes
**Then** the URL updates to include `?portfolio=[selected]`
**And** all dashboard metrics recalculate to show only that portfolio's data
**And** the portfolio selection persists when I switch tabs (URL param carried in tab links) (FR2)

**Given** I select "All Portfolios" from the dropdown
**When** the selection changes
**Then** the `?portfolio=` param is removed from the URL
**And** metrics show the aggregate view across all portfolios

**Given** market data exists in the `market_data` table
**When** the PriceTimestamp component renders
**Then** it displays "Prices as of [date] close" using the most recent `fetched_at` from market_data
**And** text is 12px/regular per the typography system (FR3, UX-DR4)

**Given** the most recent price data is older than the current date
**When** the PriceTimestamp component renders
**Then** the timestamp text changes to amber color (`amber-500`)
**And** an amber dot indicator appears next to the text
**And** the user can see the data is stale without searching for this information (FR4, UX-DR4)

**Given** I click the Refresh button (secondary style: white background, `zinc-900` border)
**When** the refresh is in progress
**Then** `refreshPrices` and `refreshFxRates` Server Actions fire in parallel
**And** the button shows a spinner and becomes disabled
**And** the timestamp text is replaced with "Refreshing..."
**And** after completion, the timestamp updates to reflect the new fetch time
**And** all dashboard metrics recalculate with fresh data (FR50, UX-DR13)

**Given** the refresh fails (FMP unreachable)
**When** the Server Actions return failure
**Then** the PriceTimestamp shows "Unable to refresh — last prices from [date]" in amber
**And** no modal or toast appears — the message is inline and contextual (UX-DR20)

**Given** the button hierarchy is established
**When** buttons render across the app
**Then** only one primary button (solid `zinc-900`, white text) is visible per view at a time
**And** secondary buttons use white background with `zinc-900` border
**And** all buttons use 13px font, medium weight (UX-DR16)

## Epic 3: Position Viewing & Drill-Down

User can view all active positions with 10+ computed columns, view closed positions with realized P&L, filter by portfolio, sort by any column, and click a position row to drill down to its transactions.

### Story 3.1: Active Positions Table

As a user,
I want to see all my active positions with computed columns in a sortable, filterable table,
So that I can assess each holding's performance at a glance.

**Acceptance Criteria:**

**Given** active positions exist (shares held > 0)
**When** I navigate to the Positions page
**Then** I see a TanStack Table with columns: Ticker, Portfolio, Shares, Avg Entry, Last Price, Cost Basis, Market Value, Dividends (net), Sell Proceeds, P&L, Weight%
**And** all columns display computed values from the computation engine (FR5)

**Given** the active positions table renders
**When** I examine the number formatting
**Then** currency columns (Avg Entry, Last Price, Cost Basis, Market Value, Dividends, Sell Proceeds, P&L) show $ prefix, comma thousands, 2 decimal places, right-aligned
**And** Shares shows 1 decimal place, right-aligned
**And** Weight% shows 1 decimal place with % suffix, right-aligned
**And** P&L is colored `emerald-600` with + prefix if positive, `red-600` with - prefix if negative
**And** all numeric columns use tabular figures (monospace digits)
**And** table row height is 40px (UX-DR17, UX-DR24)

**Given** the active positions table is loaded
**When** no sort has been applied
**Then** positions are sorted by market value descending by default (UX-DR5)

**Given** the active positions table is displayed
**When** I click any column header
**Then** the table sorts ascending by that column (first click), descending (second click), removes sort (third click)
**And** a small arrow indicator appears next to the sorted column header text (FR9, UX-DR22)

**Given** a `?portfolio=` URL parameter is present
**When** the Positions page loads
**Then** the active positions table shows only positions belonging to that portfolio (FR6)

**Given** no `?portfolio=` parameter is present (aggregate view)
**When** the Positions page loads
**Then** the active positions table shows all active positions across all portfolios

**Given** no active positions exist (or none match the current portfolio filter)
**When** the Positions page loads
**Then** an empty state message is displayed: "No positions in [portfolio name]" or "No positions yet" for aggregate

### Story 3.2: Closed Positions Table & Drill-Down Navigation

As a user,
I want to see my closed positions with realized P&L and click any position to see its underlying transactions,
So that I can review past investments and audit any position's numbers.

**Acceptance Criteria:**

**Given** closed positions exist (shares held = 0, fully divested)
**When** I view the Positions page
**Then** I see a separate table below the active positions table with columns: Ticker, Portfolio, Avg Entry, Last Price, Total Invested, Total Proceeds, Dividends (net), Realized P&L
**And** the closed positions table has the same formatting rules as the active table (currency 2dp, right-aligned, P&L coloring, tabular figures, 40px row height)
**And** section spacing between active and closed tables is 32px (FR7, UX-DR6, UX-DR24)

**Given** a `?portfolio=` URL parameter is present
**When** the closed positions table renders
**Then** only closed positions belonging to that portfolio are shown (FR8)

**Given** the closed positions table is displayed
**When** I click any column header
**Then** the table sorts by that column using the same ascending/descending/clear cycle as the active table (FR9, UX-DR22)

**Given** any position row in either the active or closed positions table
**When** I hover over the row
**Then** the cursor changes to pointer and the row background changes to `zinc-100` (UX-DR25)

**Given** I click a position row (active or closed)
**When** the click event fires
**Then** I am navigated to `/transactions?ticker=[ticker]&portfolio=[portfolio]`
**And** the Transactions page loads with those filters pre-applied (FR10, UX-DR25)

**Given** an edit or delete in a future epic creates a negative position (shares held < 0)
**When** the active positions table renders
**Then** the affected position row is highlighted with an amber background and a warning icon
**And** this signals an invalid state for the user to investigate and resolve (FR41, UX-DR26)

## Epic 4: Transaction Ledger & Inline Editing

User can view the complete transaction ledger, filter by portfolio and ticker, sort by any column, and edit any transaction inline with instant recomputation of all affected positions and aggregates.

### Story 4.1: Transaction Ledger with Filtering and Sorting

As a user,
I want to view my complete transaction history with the ability to filter by portfolio and ticker and sort by any column,
So that I can find and review any transaction quickly.

**Acceptance Criteria:**

**Given** transactions exist in the database
**When** I navigate to the Transactions page
**Then** I see a TanStack Table with columns: Date, Ticker, Action, Quantity, Price, Fees, Portfolio, Currency
**And** all transactions are displayed with proper formatting (dates as readable strings, currency values with $ prefix and 2dp, quantities with 1dp, right-aligned numerics, tabular figures)
**And** table row height is 40px (FR11, UX-DR7)

**Given** the transactions table is loaded
**When** no sort has been applied
**Then** transactions are sorted by date descending by default (UX-DR7)

**Given** the transactions table is displayed
**When** I click any column header
**Then** the table sorts ascending (first click), descending (second click), removes sort (third click)
**And** a small arrow indicator appears next to the sorted column header text (FR14, UX-DR22)

**Given** a `?portfolio=` URL parameter is present
**When** the Transactions page loads
**Then** the table shows only transactions belonging to that portfolio (FR12)

**Given** a `?ticker=` URL parameter is present
**When** the Transactions page loads
**Then** the table shows only transactions for that ticker (FR13)

**Given** both `?portfolio=` and `?ticker=` URL parameters are present (e.g., from position drill-down)
**When** the Transactions page loads
**Then** the table is filtered by both portfolio and ticker simultaneously

**Given** one or more filters are active
**When** the filter display area renders
**Then** I see text showing "Filtered by: [ticker] · [portfolio]" (one or both, depending on active filters)
**And** a "Clear" link is displayed next to the filter text
**And** clicking "Clear" removes all filters and reloads the full transaction list (UX-DR23)

**Given** no transactions match the current filters
**When** the Transactions page renders
**Then** I see an empty state: "No transactions for [ticker] in [portfolio]" with a "Clear filters" link (UX-DR14)

**Given** the Transactions page receives `searchParams` from the URL
**When** the page component reads filter values
**Then** it reads from the `searchParams` prop (Server Component), not from `useSearchParams()` hook

### Story 4.2: Inline Transaction Editing with Recomputation

As a user,
I want to edit any transaction field directly in the table and see all affected values recalculate immediately,
So that I can correct errors without leaving context and trust that the fix is applied everywhere.

**Acceptance Criteria:**

**Given** the transactions table is displayed
**When** I click on a cell (e.g., the Price cell of a transaction)
**Then** the cell becomes an input field with the current value selected
**And** the cell border changes to `zinc-900` to indicate edit mode (FR15, UX-DR8)

**Given** I am editing a cell
**When** I press Enter or Tab
**Then** the value is saved via the `updateTransaction` Server Action
**And** the Server Action validates the input with Zod
**And** `revalidatePath('/', 'layout')` is called
**And** the cell exits edit mode and shows the updated value
**And** a brief subtle highlight appears on the cell to confirm the change (UX-DR8)

**Given** I am editing a cell
**When** I press Escape
**Then** the edit is cancelled
**And** the cell reverts to its original value
**And** no Server Action is called (UX-DR8)

**Given** a transaction is successfully edited
**When** the page re-renders after revalidation
**Then** all affected positions (active and closed) reflect the updated computation
**And** dashboard aggregate metrics reflect the change
**And** the update is visible without manual page refresh (FR19)

**Given** I edit a transaction with an invalid value (e.g., empty required field, negative price on a buy)
**When** the `updateTransaction` Server Action validates the input
**Then** it returns `ActionResult` with `success: false` and field-specific error message
**And** the error is displayed inline below the affected cell in red text
**And** the error persists until the value is corrected (UX-DR20)

**Given** I edit a currency field from USD to GBP on a transaction
**When** the save triggers recomputation
**Then** cost basis, market value, and P&L for the affected position recalculate using the appropriate FX rates
**And** the updated values propagate to the positions table and dashboard

**Given** the `updateTransaction` Server Action is implemented
**When** I examine the code
**Then** it follows the Server Action template: Zod validation → Drizzle mutation → `revalidatePath('/', 'layout')` → return `ActionResult`
**And** the action never throws — Zod errors map to `fieldErrors`, infrastructure errors are caught and returned as descriptive messages

## Epic 5: Transaction Import

User can download the Excel template, upload a filled file, go through guided multi-step validation with inline error correction, review and handle duplicate detection per row, and commit the import atomically.

### Story 5.1: Excel Template Download & File Upload with Validation

As a user,
I want to download an Excel template, fill it with my transaction history, and upload it for automated validation,
So that I can import my data with confidence that errors are caught before anything enters the system.

**Acceptance Criteria:**

**Given** I navigate to the Import page
**When** I look at Step 1 (Upload)
**Then** I see a "Download Template" link/button and a file upload area with drag-and-drop zone and file picker
**And** the upload area accepts `.xlsx` files only (UX-DR10 Step 1)

**Given** I click "Download Template"
**When** the download completes
**Then** I receive an Excel file (`template.xlsx`) with columns: Date, Ticker, Action, Quantity, Price, Fees, Portfolio, Currency
**And** the template includes column headers with the expected format documented (FR20)

**Given** I upload a completed Excel file (via drag-and-drop or file picker)
**When** the file is submitted
**Then** the file is uploaded as FormData to the `validateImport` Server Action
**And** the server parses the file using ExcelJS (server-side only)
**And** every row is validated with Zod for: required fields present, correct data types, valid action type (buy/sell/dividend/fee) (FR21, FR22)

**Given** the validation processes rows
**When** applying validation rules
**Then** rows are processed in chronological order by date before applying sell-more-than-held checks (FR28)
**And** negative values for quantity and price are rejected on buy, sell, and fee transactions
**And** negative amounts are permitted only for dividend action types (representing withholding tax) (FR29)

**Given** the validation completes
**When** the Server Action returns results
**Then** each row has a status: valid, error, or duplicate
**And** the import wizard advances to Step 2 (Validation) if errors exist, or Step 3 (Duplicates) if no errors but duplicates exist, or Step 4 (Confirm) if all rows are clean

### Story 5.2: Validation Error Display & Inline Correction

As a user,
I want to see exactly which rows have errors and fix them directly in the UI without re-uploading,
So that I can correct mistakes quickly and proceed with the import.

**Acceptance Criteria:**

**Given** the validation found rows with errors
**When** Step 2 (Validation) of the import wizard renders
**Then** I see a table showing all imported rows with error indicators
**And** error rows are clearly distinguishable from valid rows
**And** the error count is displayed: "[N] rows need attention" (UX-DR10 Step 2)

**Given** a row has a validation error on a specific field
**When** the validation table renders that row
**Then** the error cell has a red border
**And** a specific error message is displayed below the cell (e.g., "Required field", "Negative quantity not allowed for buy", "Cannot sell more than held") (FR23, UX-DR11)

**Given** I click on an error cell in the validation table
**When** the cell becomes editable
**Then** I can correct the value using the same inline editing pattern as the transactions table (click → input → Enter saves)
**And** correcting the value triggers immediate re-validation of that specific row
**And** if the correction resolves the error, the red border and error message are removed (FR24, UX-DR11)

**Given** all errors have been corrected
**When** no error rows remain
**Then** the wizard enables progression to the next step (Step 3: Duplicates, or Step 4: Confirm if no duplicates)

**Given** some errors remain uncorrected
**When** I attempt to proceed
**Then** the wizard prevents progression and keeps the error display visible

### Story 5.3: Duplicate Detection, Review & Atomic Import

As a user,
I want to review flagged duplicates with the ability to override per row and then import all confirmed transactions atomically,
So that I never get accidental duplicates but can still import legitimate same-day trades.

**Acceptance Criteria:**

**Given** validated rows are checked against existing transactions and within the import batch
**When** duplicate detection runs
**Then** duplicates are identified by matching on: date, ticker, action, quantity, price, and portfolio (FR25)

**Given** duplicates are found
**When** Step 3 (Duplicate Review) of the import wizard renders
**Then** I see a table showing flagged duplicate rows with amber row backgrounds
**And** a summary is displayed: "[N] potential duplicates"
**And** each flagged row has a skip/override toggle (default: skip) (FR26, UX-DR10 Step 3)

**Given** I review a flagged duplicate
**When** I toggle a row from "Skip" to "Override"
**Then** that row will be included in the import despite being flagged as a duplicate
**And** the toggle state is visually clear (skip = row dimmed/struck-through, override = row normal)

**Given** all duplicates have been reviewed (or no duplicates were found)
**When** Step 4 (Confirm) renders
**Then** I see the final count of rows to be imported: "[N] transactions ready to import"
**And** a primary "Import" button is displayed (UX-DR10 Step 4)

**Given** I click the "Import" button
**When** the `commitImport` Server Action executes
**Then** all confirmed rows (valid + overridden duplicates, excluding skipped duplicates) are inserted into the transactions table in a single atomic operation
**And** if any row fails to insert, the entire batch is rolled back — no partial imports (FR27)
**And** `revalidatePath('/', 'layout')` is called after successful import

**Given** the import completes successfully
**When** the Server Action returns success
**Then** an inline success banner appears: "[N] transactions imported successfully" with green-tinted background
**And** the banner auto-dismisses after 5 seconds (UX-DR20)
**And** I am redirected to the Dashboard page where the imported data is reflected in metrics and positions

**Given** the import wizard is implemented
**When** I examine the client-side code
**Then** the import wizard uses `useReducer` with state shape: `{ step, file, parsedRows, validationErrors, duplicates, confirmedRows }`
**And** the wizard component is marked `'use client'`

## Epic 6: Manual Transaction Management

User can manually add a new transaction via an inline form, delete a single transaction with confirmation, and bulk delete selected transactions — all with the same validation rules as import.

### Story 6.1: Manual Transaction Add

As a user,
I want to add a new transaction directly in the UI without going through the import flow,
So that I can quickly record a new trade or correct a missing entry.

**Acceptance Criteria:**

**Given** I am on the Transactions page
**When** I click an "Add Transaction" button
**Then** an inline row appears at the top of the transactions table (not a modal)
**And** the row contains input fields for: Date, Ticker, Action (dropdown: buy/sell/dividend/fee), Quantity, Price, Fees, Portfolio, Currency
**And** a "Save" button appears at the end of the row
**And** a "Cancel" ghost button appears next to "Save" (FR16, UX-DR9)

**Given** I fill in the add transaction row
**When** I click "Save"
**Then** the `addTransaction` Server Action validates the input with the same rules as import:
**And** all required fields must be present
**And** negative values for quantity and price are rejected on buy, sell, and fee actions (permitted only for dividend withholding)
**And** sell transactions are validated against currently held shares (sell-more-than-held check)
**And** duplicate detection runs against existing transactions (matching on date, ticker, action, quantity, price, portfolio) (FR30)

**Given** validation passes and no duplicates are found
**When** the Server Action completes
**Then** the transaction is inserted into the database
**And** `revalidatePath('/', 'layout')` triggers recomputation of all affected positions and aggregates
**And** the inline add row disappears
**And** the new transaction appears in the table at its correct sorted position

**Given** validation fails (missing field, negative value, sell exceeds held shares)
**When** the Server Action returns errors
**Then** field-specific errors display inline below the affected input fields in red text
**And** the add row remains open for correction
**And** errors persist until resolved (UX-DR20)

**Given** a duplicate is detected during manual add
**When** the Server Action returns the duplicate warning
**Then** the user is informed that a matching transaction exists
**And** the user can choose to proceed (override) or cancel

**Given** I click "Cancel" on the add transaction row
**When** the cancel action fires
**Then** the inline row disappears without saving
**And** no Server Action is called

### Story 6.2: Transaction Delete & Bulk Delete

As a user,
I want to delete individual or multiple transactions with a confirmation step,
So that I can remove incorrect entries while being protected from accidental deletion.

**Acceptance Criteria:**

**Given** the transactions table is displayed
**When** I look at a transaction row
**Then** I see a delete button (destructive style: white background, `red-600` text and border) on the row (FR17)

**Given** I click the delete button on a transaction row
**When** the click event fires
**Then** a Shadcn Dialog appears asking for confirmation: "Delete this transaction? This will recompute affected positions."
**And** the dialog has a "Delete" destructive button and a "Cancel" ghost button (UX-DR15)

**Given** I confirm the deletion in the dialog
**When** the `deleteTransaction` Server Action executes
**Then** the transaction is removed from the database
**And** `revalidatePath('/', 'layout')` triggers recomputation of all affected positions and aggregates
**And** if this was the last transaction for a ticker + portfolio combination, the position is automatically removed (FR42)

**Given** I click "Cancel" in the delete confirmation dialog
**When** the dialog closes
**Then** no deletion occurs and the transaction remains

**Given** the transactions table is displayed
**When** I look at the leftmost column
**Then** I see a checkbox column for row selection
**And** the column header has a "select all" checkbox (FR18, UX-DR7)

**Given** I have selected one or more transactions via checkboxes
**When** I click the "Delete Selected" button (destructive style)
**Then** a Shadcn Dialog appears: "Delete [N] selected transactions? This will recompute affected positions."
**And** the dialog has a "Delete [N]" destructive button and a "Cancel" ghost button (UX-DR15)

**Given** I confirm the bulk deletion
**When** the `bulkDeleteTransactions` Server Action executes
**Then** all selected transactions are removed in a single operation
**And** `revalidatePath('/', 'layout')` triggers recomputation
**And** positions with no remaining transactions are automatically removed (FR42)
**And** the checkboxes are cleared after successful deletion

**Given** a delete or bulk delete creates a negative position (more shares sold than bought in remaining transactions)
**When** the positions table re-renders
**Then** the affected position row is highlighted with amber background and warning icon
**And** the system does not prevent the delete — it flags the invalid state for the user to resolve (FR41, UX-DR26)
