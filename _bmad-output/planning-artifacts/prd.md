---
stepsCompleted: ['step-01-init', 'step-02-discovery', 'step-02b-vision', 'step-02c-executive-summary', 'step-03-success', 'step-04-journeys', 'step-05-domain', 'step-06-innovation', 'step-07-project-type', 'step-08-scoping', 'step-09-functional', 'step-10-nonfunctional', 'step-11-polish', 'step-12-complete']
classification:
  projectType: web_app
  domain: fintech
  complexity: high
  projectContext: greenfield
inputDocuments:
  - product-brief-personal-portfolio.md
  - product-brief-personal-portfolio-distillate.md
documentCounts:
  briefs: 2
  research: 0
  brainstorming: 0
  projectDocs: 0
workflowType: 'prd'
---

# Product Requirements Document - Personal Portfolio Tracker

**Author:** Maksim
**Date:** 2026-04-03

## Executive Summary

Personal Portfolio Tracker is a localhost web application that gives a self-directed investor a single, accurate, consolidated view of holdings spread across multiple brokerage accounts. Users import historical transactions via a standardized Excel template — no broker credentials required — and the app reconstructs every position from trade history using weighted average cost. Live stock prices and FX rates from the FinancialModelingPrep (FMP) API keep valuations current, with all values normalized to USD.

The MVP delivers three core views: a dashboard with portfolio-level and aggregate metrics, a positions table showing computed cost basis and P&L per holding, and a full transaction ledger with inline editing. The transaction ledger is the single source of truth — all portfolio state is derived from it, making every number auditable back to the trades that produced it.

Built for one user — its creator — this tool is designed as a scalable foundation for advanced analytical features (IRR, benchmarking, AI-driven analysis) that spreadsheets cannot support and off-the-shelf aggregators do not offer.

## What Makes This Special

**Trade-level reconstruction, not snapshots.** Positions are computed from the complete history of buy, sell, dividend, and fee transactions — not captured as point-in-time broker snapshots. Cost basis, average entry price, and P&L are always accurate and fully traceable. This event-sourced architecture enables future analytics that snapshot-based tools fundamentally cannot support.

**No credential sharing.** Import via Excel template means zero Plaid integrations, zero broker logins stored, zero third-party access to financial accounts. Data ownership is absolute.

**Purpose-built and extensible.** Tailored to the builder's exact workflow and investment style, with an architecture designed to grow into IRR calculations, benchmark comparisons, and AI-powered portfolio analysis.

## Project Classification

- **Project Type:** Web Application (SPA, localhost)
- **Domain:** Fintech (personal investment tracking)
- **Complexity:** High — driven by calculation accuracy requirements (weighted average cost, multi-currency FX, event-sourced position computation) rather than regulatory compliance
- **Project Context:** Greenfield — new build, no existing codebase
- **Chrome-only** — no cross-browser testing required
- **Desktop-only** — no responsive/mobile layout
- **No SEO** — localhost, no server-side rendering needed
- **No accessibility** — single-user personal tool

## Success Criteria

### User Success

- **Accuracy drives adoption:** If computed values exactly match broker statements for cost basis, share count, and P&L, the app becomes the daily portfolio view. If they don't, it's a bug.
- **Frictionless import:** Transactions import via Excel with a clear multi-step flow — validation, error correction, duplicate review — that builds confidence at every stage.
- **Incremental trust-building:** The user can import a single ticker's history, verify against broker statements, and gradually scale up to the full 1400+ transaction history.

### Business Success

- **MVP complete when real portfolio is loaded and trusted.** All actual positions across all brokers are imported, computed values exactly match broker-reported figures, and the builder relies on the app as the single source of truth.
- **Foundation validated:** The data model and event-sourced architecture demonstrably support future feature development — no redesign needed to add IRR, benchmarking, or AI analysis later.

### Technical Success

- **Zero-tolerance calculation accuracy:** Weighted average cost, cost basis, and P&L computations must exactly match broker statements. Any discrepancy is a defect.
- **FX precision:** Multi-currency conversions use date-matched FX rates (trade-date for cost, price-date for market value, payment-date for dividends) and produce exact results consistent with broker-reported USD equivalents.
- **Price/FX freshness transparency:** The UI displays the timestamp of the last successful price and FX rate update. Stale data is clearly indicated, never silently presented as current.
- **Edit propagation:** Modifying any historical transaction correctly recomputes all affected positions and aggregate metrics on save.
- **Import reliability:** All-or-nothing batch import — no partial imports. Validation catches errors before any data enters the system.
- **Dividend accumulation:** Dividend transactions correctly accumulate per position (net of withholding tax) and contribute to total P&L calculations, with amounts converted at payment-date FX rates.
- **Scale:** System handles 1400+ transactions (~100 positions) without degradation, supporting ongoing additions of 10-20 transactions per month.

### Measurable Outcomes

- Positions table exactly matches broker statements for cost basis, share count, and P&L across all imported portfolios
- Dashboard aggregate values reconcile to the sum of individual broker holdings
- Initial import of 1400+ transactions completes successfully with clear duplicate/error reporting
- Transaction edits immediately reflect updated values across positions and dashboard on save
- Closed positions (fully divested) display in a separate table with realized P&L

## User Journeys

### Journey 1: First-Time Setup & Trust-Building

Maksim installs the app and downloads the Excel template. He picks a single ticker — one he knows well — and fills in its full transaction history: buys, a partial sell, and two dividends. He uploads the file. The validation phase shows all rows clean, no duplicates. He confirms the import.

He opens the positions table. The average entry price, cost basis, and current P&L are displayed. He pulls up the same ticker in his broker app and compares line by line. The numbers match exactly. He checks the FX conversion — the price timestamp shows yesterday's close, the FX rate matches that date. Everything checks out.

He adds a second ticker from a different broker, this time in GBP. Imports, verifies, matches. Trust established. He's ready to scale up.

### Journey 2: Bulk Import & Ongoing Maintenance

With trust in the calculations confirmed, Maksim prepares a full export of his transaction history — 1400 rows across multiple brokers and currencies. He uploads. The validation phase flags 6 rows: two have missing ticker symbols, four are detected as duplicates from his earlier test imports.

He corrects the two ticker errors directly in the UI. He reviews the four duplicates — they're genuine duplicates from his test, so he leaves them skipped. He confirms. All 1394 new transactions import atomically.

A month later, he has 15 new transactions. He fills them into the template, uploads. Three are flagged as duplicates — he bought the same stock on the same day at the same price in two different accounts. He overrides two of them (legitimate separate trades) and skips one (actual duplicate). Import completes.

### Journey 3: Daily Portfolio Check

Maksim opens the app in the morning. The dashboard defaults to the aggregate view across all portfolios: total value, total cost basis, total P&L, and cash returned. The price timestamp reads "as of 2026-04-02 market close." He switches the portfolio selector to his US brokerage — sees that account's metrics in isolation. Switches back to the aggregate view.

He scrolls to the positions table. His AAPL position shows avg entry $142.30, 50 shares, cost basis $7,115, market value $8,650, P&L +$1,535. Below, the closed positions table shows his fully sold TSLA position: average entry price, last price, total invested, proceeds, dividends received, realized P&L.

He sees what he needs in under 30 seconds. No second broker app opened.

### Journey 4: Error Discovery & Correction

While reviewing positions, Maksim notices his MSFT cost basis looks too high. He clicks the MSFT row and navigates to the transactions page, pre-filtered by MSFT. He spots it — a buy transaction where he entered the price in GBP instead of USD. He edits the currency field inline, saves. The positions table and dashboard recalculate immediately. The MSFT cost basis now matches his broker statement.

### Journey Requirements Summary

| Journey | Key Capabilities Revealed |
|---|---|
| First-time setup | Excel template download, single-ticker import, positions display, price/FX timestamps, broker comparison workflow |
| Bulk import | Large batch handling (1400+), validation with inline correction, duplicate detection with override, atomic import |
| Daily check | Dashboard with portfolio selector (default: aggregate), active + closed positions tables (scrollable, ~100 positions), fast load |
| Error correction | Position-to-transaction drill-down, transaction filtering and sorting, inline editing, immediate recomputation on save |

## Project Scoping & Phased Development

### MVP Strategy & Philosophy

**MVP Approach:** Problem-solving MVP — deliver accurate, consolidated portfolio visibility that replaces spreadsheets and broker app tab-switching. Zero compromise on calculation correctness. Single user, localhost.

**Resource Requirements:** Solo developer (the builder). No external dependencies beyond FMP API.

### MVP Feature Set

- Dashboard with portfolio selector (default: All Portfolios / aggregate), aggregate metrics, price/FX timestamps
- Active positions table with computed columns and position weight (%), filterable and sortable by any column
- Closed positions table with realized P&L
- Position-to-transaction drill-down (click position row to view filtered transactions)
- Transactions page with portfolio and ticker filters, sortable by any column
- Transaction inline editing with edit propagation (changes recompute all affected positions)
- Manual transaction add with full validation
- Transaction delete and bulk delete
- Multi-step import flow: Excel template download, upload, validation with inline error correction, duplicate detection with per-row override, all-or-nothing atomic commit
- Live stock prices and FX rates via FMP API (on-demand, manual refresh button)
- Multi-currency support with USD base currency
- Position computation from historical trades using weighted average cost
- Four transaction action types: buy, sell, dividend, fee
- Scrollable tables supporting ~100 positions across active and closed

**MVP Acceptance Criterion:** MVP is done when the user can import one ticker's history, see it on the dashboard and positions table with correct calculations, and verify against the broker.

### Post-MVP Features

**Phase 2 (Growth) — no priority order, evaluated only after MVP is perfect:**
- Internal rate of return (IRR) per position, portfolio, and aggregate
- Benchmark comparison against indices
- AI-powered portfolio analysis (risk, concentration, rebalancing)
- Richer visualizations (allocation charts, performance over time)
- Automated imports (broker CSV format adapters)

**Phase 3 (Vision):**
- Corporate action handling (splits, mergers, spin-offs)
- Advanced analytics and reduced manual effort through automation

### Risk Mitigation Strategy

**Data Model & Calculation Risk:**
- The position computation model (weighted average cost, sell-reduces-cost-basis, fee impact on cost basis, dividend accumulation) is the foundation of all displayed data. A bug in the computation model makes all portfolio data untrustworthy. Zero-tolerance accuracy is the core requirement. Mitigation: incremental validation — import one ticker, verify every computed value against broker statements before scaling up.

**FX Rate Gap Risk:**
- Historical FX rates from FMP will have gaps (weekends, holidays, data gaps). Mitigation: most recent previous available rate fallback. This is an accepted trade-off — results may differ slightly from broker calculations on affected dates. Documented as expected behavior, not a defect.

**FMP API Risk:**
- Downtime or unreachability. Mitigation: cache responses within session, display price/FX timestamps so staleness is visible, show N/A for unavailable prices.

**Performance Risk:**
- 1400+ transactions must compute within 2 seconds. Mitigation: test at realistic scale early, optimize if needed.

**Resource Risk:**
- Solo developer. Mitigation: tight MVP scope, no premature optimization, growth features explicitly deferred.

## Functional Requirements

### Dashboard & Portfolio Overview

- FR1: User can view aggregate portfolio metrics (total value, total cost basis, total P&L, cash returned) across all portfolios
- FR2: User can select a specific portfolio or "All Portfolios" to view metrics in isolation or aggregate. "All Portfolios" is the default view on load, triggering the aggregate display behavior defined in FR51
- FR3: User can see the timestamp of the last successful price and FX rate update
- FR4: User can see when displayed price/FX data is stale

### Position Management

- FR5: User can view all active positions with computed columns: average entry price, shares held, cost basis, current market value, last price, dividends received (net), sell proceeds, total P&L, position weight (%)
- FR6: User can filter the active positions table by portfolio
- FR7: User can view closed positions (fully divested) in a separate table showing average entry price, last price, total invested, total proceeds, dividends received (net), and realized P&L
- FR8: User can filter the closed positions table by portfolio
- FR9: User can sort the active and closed positions tables by any column
- FR10: User can navigate from a position row to the transactions page, pre-filtered by that position's ticker and portfolio

### Transaction Management

- FR11: User can view the complete transaction ledger
- FR12: User can filter transactions by portfolio
- FR13: User can filter transactions by ticker
- FR14: User can sort the transaction ledger by any column
- FR15: User can edit individual transaction fields inline
- FR16: User can add a new transaction manually via the UI without importing from Excel
- FR17: User can delete a transaction
- FR18: User can select multiple transactions and delete them in a single bulk action
- FR19: System recomputes all affected positions and aggregates when a transaction is edited, added, or deleted

### Data Import

- FR20: User can download a standardized Excel template with required fields (date, ticker, action, quantity, price, fees, portfolio, currency)
- FR21: User can upload a completed Excel file for import
- FR22: System validates all rows for required fields and format correctness
- FR23: System displays per-row validation errors with specific error descriptions
- FR24: User can correct validation errors directly in the UI before import
- FR25: System detects duplicate transactions across existing data and the import batch, defined as matching on: date, ticker, action, quantity, price, and portfolio
- FR26: User can review flagged duplicates and override detection per row
- FR27: System imports all validated rows atomically — no partial imports
- FR28: System processes imported transactions in chronological order (by date) before applying validation rules including sell-more-than-held checks
- FR29: System rejects negative values for quantity and price on buy, sell, and fee transactions. Negative amounts are only permitted for dividend action types (representing withholding tax)
- FR30: Manual transaction add applies the same validation rules as import: required field checks, sell-more-than-held validation, negative value restrictions, and duplicate detection

### Position Computation

- FR31: System computes average entry price as (total cost of all purchases + standalone fees) / total shares purchased. Buy fees are added to the purchase cost (e.g., 100 shares at $10 with $5 fee = $1,005 cost)
- FR32: System reduces cost basis proportionally using weighted average cost when shares are sold. Sell fees are deducted from sell proceeds
- FR33: System accumulates dividends per position (net of withholding tax) and includes them in total P&L
- FR34: System tracks sell proceeds separately per position
- FR35: System computes total P&L as (current market value + total dividends received + total sell proceeds) - total amount invested
- FR36: System computes current market value per position as shares held × last price, converted to USD using price-date FX rate
- FR37: System computes cash returned as total dividends received + total sell proceeds across all positions (or per portfolio when filtered)
- FR38: System identifies a position as a unique combination of ticker + portfolio. The same ticker held in different portfolios is tracked as separate positions
- FR39: System supports four transaction action types: buy, sell, dividend, and fee
- FR40: Standalone fee transactions increase the position's cost basis and average entry price, reducing total P&L
- FR41: System validates that sell transactions do not exceed currently held shares during import and manual add. If a delete or edit creates a negative position, the system flags it visually as an invalid state for the user to resolve
- FR42: System automatically removes a position when all its transactions are deleted. Positions exist only when at least one transaction references that ticker + portfolio combination

### Multi-Currency & FX

- FR43: System converts cost basis to USD using trade-date FX rates
- FR44: System converts current market value to USD using price-date FX rates
- FR45: System converts dividend amounts to USD using payment-date FX rates
- FR46: System falls back to the most recent previous available FX rate when no rate exists for a specific date
- FR47: System stores and computes using full imported precision, rounding only at display (2 decimal places for dollar values, 1 for shares, 1 for percentages)

### Market Data

- FR48: System fetches current stock prices from FMP API on demand
- FR49: System fetches FX rates from FMP API on demand
- FR50: User can trigger a manual refresh of stock prices and FX rates via a refresh button
- FR51: System caches API responses within a session to avoid redundant calls
- FR52: System displays N/A for price-dependent values when FMP returns no price for a ticker (delisted, invalid symbol, or API error)

### Aggregate View

- FR53: When viewing the aggregate (all portfolios) view, positions with the same ticker across different portfolios are combined into a single row showing merged metrics for display purposes only; underlying data remains tracked per portfolio
- FR54: User can see each active position's weight as a percentage of total portfolio value, displayed to 1 decimal place

### FR Traceability

| FR Group | Source Journeys | Source Success Criteria |
|---|---|---|
| Dashboard & Portfolio Overview (FR1-4) | J3: Daily Check | Accuracy drives adoption; Price/FX freshness transparency |
| Position Management (FR5-10) | J3: Daily Check; J4: Error Correction | Zero-tolerance calculation accuracy |
| Transaction Management (FR11-19) | J4: Error Correction; J2: Bulk Import | Edit propagation; Import reliability |
| Data Import (FR20-30) | J1: First-Time Setup; J2: Bulk Import | Frictionless import; Incremental trust-building |
| Position Computation (FR31-42) | All journeys | Zero-tolerance calculation accuracy; Dividend accumulation |
| Multi-Currency & FX (FR43-47) | J1: First-Time Setup; J3: Daily Check | FX precision |
| Market Data (FR48-52) | J3: Daily Check | Price/FX freshness transparency; Scale |
| Aggregate View (FR53-54) | J3: Daily Check | Accuracy drives adoption |

## Non-Functional Requirements

### Performance

- Any view (dashboard, positions, transactions) loads and renders within 2 seconds with a full dataset of 1400+ transactions
- Position computation (weighted average cost, P&L, FX conversions) for the entire portfolio completes within 2 seconds
- Import validation and duplicate detection for a 1400+ row batch completes within 5 seconds
- Transaction edit, add, or delete triggers recomputation and UI update within 1 second
- Manual price/FX refresh completes within 5 seconds (dependent on FMP API response time)

### Integration

- FMP API is the sole external dependency (paid subscription, no rate-limiting handling). Graceful degradation on FMP unreachability per FR3, FR4, FR52
