---
stepsCompleted:
  - step-01-document-discovery
  - step-02-prd-analysis
  - step-03-epic-coverage-validation
  - step-04-ux-alignment
  - step-05-epic-quality-review
  - step-06-final-assessment
documentInventory:
  prd: _bmad-output/planning-artifacts/prd.md
  architecture: _bmad-output/planning-artifacts/architecture.md
  epics: _bmad-output/planning-artifacts/epics.md
  ux: _bmad-output/planning-artifacts/ux-design-specification.md
---

# Implementation Readiness Assessment Report

**Date:** 2026-04-06
**Project:** Personal Portfolio

## Document Inventory

| Document Type | File | Format |
|---|---|---|
| PRD | prd.md | Whole |
| Architecture | architecture.md | Whole |
| Epics & Stories | epics.md | Whole |
| UX Design | ux-design-specification.md | Whole |

**Duplicates:** None
**Missing Documents:** None

## PRD Analysis

### Functional Requirements

**Dashboard & Portfolio Overview (FR1–FR4)**
- FR1: User can view aggregate portfolio metrics (total value, total cost basis, total P&L, cash returned) across all portfolios
- FR2: User can select a specific portfolio or "All Portfolios" to view metrics in isolation or aggregate. "All Portfolios" is the default view on load, triggering the aggregate display behavior defined in FR51
- FR3: User can see the timestamp of the last successful price and FX rate update
- FR4: User can see when displayed price/FX data is stale

**Position Management (FR5–FR10)**
- FR5: User can view all active positions with computed columns: average entry price, shares held, cost basis, current market value, last price, dividends received (net), sell proceeds, total P&L, position weight (%)
- FR6: User can filter the active positions table by portfolio
- FR7: User can view closed positions (fully divested) in a separate table showing average entry price, last price, total invested, total proceeds, dividends received (net), and realized P&L
- FR8: User can filter the closed positions table by portfolio
- FR9: User can sort the active and closed positions tables by any column
- FR10: User can navigate from a position row to the transactions page, pre-filtered by that position's ticker and portfolio

**Transaction Management (FR11–FR19)**
- FR11: User can view the complete transaction ledger
- FR12: User can filter transactions by portfolio
- FR13: User can filter transactions by ticker
- FR14: User can sort the transaction ledger by any column
- FR15: User can edit individual transaction fields inline
- FR16: User can add a new transaction manually via the UI without importing from Excel
- FR17: User can delete a transaction
- FR18: User can select multiple transactions and delete them in a single bulk action
- FR19: System recomputes all affected positions and aggregates when a transaction is edited, added, or deleted

**Data Import (FR20–FR30)**
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

**Position Computation (FR31–FR42)**
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

**Multi-Currency & FX (FR43–FR47)**
- FR43: System converts cost basis to USD using trade-date FX rates
- FR44: System converts current market value to USD using price-date FX rates
- FR45: System converts dividend amounts to USD using payment-date FX rates
- FR46: System falls back to the most recent previous available FX rate when no rate exists for a specific date
- FR47: System stores and computes using full imported precision, rounding only at display (2 decimal places for dollar values, 1 for shares, 1 for percentages)

**Market Data (FR48–FR52)**
- FR48: System fetches current stock prices from FMP API on demand
- FR49: System fetches FX rates from FMP API on demand
- FR50: User can trigger a manual refresh of stock prices and FX rates via a refresh button
- FR51: System caches API responses within a session to avoid redundant calls
- FR52: System displays N/A for price-dependent values when FMP returns no price for a ticker (delisted, invalid symbol, or API error)

**Aggregate View (FR53–FR54)**
- FR53: When viewing the aggregate (all portfolios) view, positions with the same ticker across different portfolios are combined into a single row showing merged metrics for display purposes only; underlying data remains tracked per portfolio
- FR54: User can see each active position's weight as a percentage of total portfolio value, displayed to 1 decimal place

**Total Functional Requirements: 54**

### Non-Functional Requirements

**Performance**
- NFR1: Any view (dashboard, positions, transactions) loads and renders within 2 seconds with a full dataset of 1400+ transactions
- NFR2: Position computation (weighted average cost, P&L, FX conversions) for the entire portfolio completes within 2 seconds
- NFR3: Import validation and duplicate detection for a 1400+ row batch completes within 5 seconds
- NFR4: Transaction edit, add, or delete triggers recomputation and UI update within 1 second
- NFR5: Manual price/FX refresh completes within 5 seconds (dependent on FMP API response time)

**Integration**
- NFR6: FMP API is the sole external dependency (paid subscription, no rate-limiting handling). Graceful degradation on FMP unreachability per FR3, FR4, FR52

**Total Non-Functional Requirements: 6**

### Additional Requirements

**Constraints & Assumptions:**
- Chrome-only — no cross-browser testing required
- Desktop-only — no responsive/mobile layout
- No SEO — localhost, no server-side rendering needed
- No accessibility — single-user personal tool
- Solo developer — tight MVP scope, no premature optimization
- FMP API paid subscription — no rate-limiting handling needed

**Risk-Related Requirements:**
- FX rate gaps (weekends/holidays): fallback to most recent previous available rate (accepted trade-off, documented behavior)
- FMP API downtime: cache responses within session, display timestamps, show N/A for unavailable prices
- Scale: 1400+ transactions, ~100 positions, 10-20 new transactions/month

### PRD Completeness Assessment

The PRD is comprehensive and well-structured. All 54 functional requirements are clearly numbered and traceable to user journeys and success criteria via the FR Traceability table. Non-functional requirements cover performance thresholds and integration constraints. Risk mitigation strategies are documented with accepted trade-offs clearly called out. The PRD provides a strong foundation for epic coverage validation.

## Epic Coverage Validation

### Coverage Matrix

| FR | Requirement Summary | Epic Coverage | Status |
|---|---|---|---|
| FR1 | Aggregate portfolio metrics | Epic 2 | ✓ Covered |
| FR2 | Portfolio selector with default | Epic 2 | ✓ Covered |
| FR3 | Price/FX update timestamp | Epic 2 | ✓ Covered |
| FR4 | Stale price/FX indicator | Epic 2 | ✓ Covered |
| FR5 | Active positions with computed columns | Epic 3 | ✓ Covered |
| FR6 | Filter active positions by portfolio | Epic 3 | ✓ Covered |
| FR7 | Closed positions with realized P&L | Epic 3 | ✓ Covered |
| FR8 | Filter closed positions by portfolio | Epic 3 | ✓ Covered |
| FR9 | Sort positions tables by any column | Epic 3 | ✓ Covered |
| FR10 | Position-to-transaction drill-down | Epic 3 | ✓ Covered |
| FR11 | Complete transaction ledger | Epic 4 | ✓ Covered |
| FR12 | Filter transactions by portfolio | Epic 4 | ✓ Covered |
| FR13 | Filter transactions by ticker | Epic 4 | ✓ Covered |
| FR14 | Sort transaction ledger by any column | Epic 4 | ✓ Covered |
| FR15 | Edit transaction fields inline | Epic 4 | ✓ Covered |
| FR16 | Add transaction manually | Epic 6 | ✓ Covered |
| FR17 | Delete a transaction | Epic 6 | ✓ Covered |
| FR18 | Bulk delete transactions | Epic 6 | ✓ Covered |
| FR19 | Recompute on transaction change | Epic 4 | ✓ Covered |
| FR20 | Download Excel template | Epic 5 | ✓ Covered |
| FR21 | Upload Excel file for import | Epic 5 | ✓ Covered |
| FR22 | Validate rows for required fields | Epic 5 | ✓ Covered |
| FR23 | Per-row validation errors | Epic 5 | ✓ Covered |
| FR24 | Correct errors in UI before import | Epic 5 | ✓ Covered |
| FR25 | Duplicate detection | Epic 5 | ✓ Covered |
| FR26 | Override duplicates per row | Epic 5 | ✓ Covered |
| FR27 | Atomic import | Epic 5 | ✓ Covered |
| FR28 | Chronological order processing | Epic 5 | ✓ Covered |
| FR29 | Reject negative values (except dividends) | Epic 5 | ✓ Covered |
| FR30 | Manual add same validation as import | Epic 6 | ✓ Covered |
| FR31 | Weighted average cost computation | Epic 1 | ✓ Covered |
| FR32 | Cost basis reduction on sell | Epic 1 | ✓ Covered |
| FR33 | Dividend accumulation per position | Epic 1 | ✓ Covered |
| FR34 | Track sell proceeds per position | Epic 1 | ✓ Covered |
| FR35 | Total P&L formula | Epic 1 | ✓ Covered |
| FR36 | Market value with FX conversion | Epic 1 | ✓ Covered |
| FR37 | Cash returned computation | Epic 1 | ✓ Covered |
| FR38 | Position = ticker + portfolio | Epic 1 | ✓ Covered |
| FR39 | Four action types | Epic 1 | ✓ Covered |
| FR40 | Standalone fees increase cost basis | Epic 1 | ✓ Covered |
| FR41 | Sell validation (not exceed held) | Epic 1 | ✓ Covered |
| FR42 | Auto-remove position when all txns deleted | Epic 1 | ✓ Covered |
| FR43 | Cost basis FX: trade-date rates | Epic 1 | ✓ Covered |
| FR44 | Market value FX: price-date rates | Epic 1 | ✓ Covered |
| FR45 | Dividend FX: payment-date rates | Epic 1 | ✓ Covered |
| FR46 | FX fallback to most recent previous rate | Epic 1 | ✓ Covered |
| FR47 | Full precision, display-only rounding | Epic 1 | ✓ Covered |
| FR48 | Fetch stock prices from FMP | Epic 2 | ✓ Covered |
| FR49 | Fetch FX rates from FMP | Epic 2 | ✓ Covered |
| FR50 | Manual refresh button | Epic 2 | ✓ Covered |
| FR51 | Cache API responses within session | Epic 2 | ✓ Covered |
| FR52 | N/A for unavailable prices | Epic 2 | ✓ Covered |
| FR53 | Aggregate combines same-ticker positions | Epic 2 | ✓ Covered |
| FR54 | Position weight percentage | Epic 2 | ✓ Covered |

### Missing Requirements

None — all 54 FRs from the PRD are covered in the epics.

### Coverage Statistics

- Total PRD FRs: 54
- FRs covered in epics: 54
- Coverage percentage: 100%

## UX Alignment Assessment

### UX Document Status

Found: `ux-design-specification.md` — comprehensive UX spec covering design system, component strategy, user journey flows, visual design foundation, consistency patterns, and responsive/accessibility strategy. Built from the PRD and product brief as input documents.

### UX ↔ PRD Alignment

- All 4 PRD user journeys are fully reflected in UX journey flows with detailed Mermaid diagrams
- UX spec defines 26 design requirements (UX-DR1–DR26) that operationalize PRD functional requirements into UI-level specifications
- PRD success criteria (accuracy, frictionless import, trust-building) are directly addressed in UX experience principles and emotional design goals
- Number formatting, P&L coloring, timestamp display, and empty states all specified in UX align with PRD requirements

### UX ↔ Architecture Alignment

- Architecture explicitly lists UX spec as an input document and references it throughout
- Tech stack selections match UX needs: Shadcn/ui for component library, TanStack Table for data tables, Tailwind for styling, Inter font
- Architecture component structure (`src/components/domain/`) maps 1:1 to UX custom components: MetricCard, PositionsTable, TransactionsTable, ImportWizard, PriceTimestamp, EmptyState
- Data flow architecture supports all UX interaction patterns:
  - Instant recomputation via `revalidatePath` supports UX inline editing pattern
  - URL search params (`?portfolio=`, `?ticker=`) supports UX filter persistence and drill-down navigation
  - Server Components for reads + Server Actions for writes supports UX loading/feedback patterns
  - `formatting.ts` module supports UX number formatting rules (currency 2dp, shares 1dp, tabular figures)
- Architectural boundaries (server-only decimal.js, pure computation service) are compatible with UX patterns

### UX ↔ Epics Alignment

- All 26 UX-DRs are mapped to epics in the epics document:
  - Epic 1: UX-DR1, DR2, DR14, DR18, DR19, DR24
  - Epic 2: UX-DR3, DR4, DR12, DR13, DR16, DR20, DR21
  - Epic 3: UX-DR5, DR6, DR17, DR22, DR25, DR26
  - Epic 4: UX-DR7, DR8, DR23
  - Epic 5: UX-DR10, DR11
  - Epic 6: UX-DR9, DR15

### Alignment Issues

None identified. All three documents (PRD, UX, Architecture) are well-aligned and cross-reference each other consistently.

### Warnings

None. UX documentation is thorough and covers all user-facing requirements from the PRD.

## Epic Quality Review

### Epic User Value Assessment

| Epic | Title | User Value | Verdict |
|---|---|---|---|
| Epic 1 | Project Foundation & Position Computation Engine | Mixed — Stories 1.1-1.3 are developer-facing (setup, computation, FX). Story 1.4 delivers user-facing app shell with empty states. | 🟡 See note below |
| Epic 2 | Market Data & Portfolio Dashboard | "User sees aggregate portfolio dashboard" — clear user outcome | ✓ Pass |
| Epic 3 | Position Viewing & Drill-Down | "User views positions and drills down to transactions" — clear user outcome | ✓ Pass |
| Epic 4 | Transaction Ledger & Inline Editing | "User views and edits transactions inline" — clear user outcome | ✓ Pass |
| Epic 5 | Transaction Import | "User imports transactions via multi-step wizard" — clear user outcome | ✓ Pass |
| Epic 6 | Manual Transaction Management | "User adds, deletes, and bulk-deletes transactions" — clear user outcome | ✓ Pass |

**Epic 1 Note:** Epic 1 is predominantly a technical foundation epic (project scaffolding, computation engine, FX conversion). Under strict best practices, this would be flagged as a critical violation — the epic title says "Foundation" and 3 of 4 stories deliver no direct user value. **However**, this is a pragmatic and justified approach for this project because: (1) the architecture mandates compute-on-read with no cached snapshots, making the computation engine a hard prerequisite for ANY UI that displays numbers; (2) the user IS the solo developer, so developer-facing deliverables have direct value; (3) Story 1.4 ensures the epic ends with a user-visible deliverable (app shell with navigation and empty states). **Recommendation:** Accept as-is — restructuring would add artificial complexity without benefit.

### Epic Independence Validation

| Epic | Dependencies | Forward References | Verdict |
|---|---|---|---|
| Epic 1 | None (foundation) | None | ✓ Pass |
| Epic 2 | Epic 1 (computation, DB, app shell) | None | ✓ Pass |
| Epic 3 | Epic 1 (computation), Epic 2 (market data) | None | ✓ Pass |
| Epic 4 | Epic 1 (DB, computation) | None | ✓ Pass |
| Epic 5 | Epic 1 (DB schema, validation) | None | ✓ Pass |
| Epic 6 | Epic 1 (DB), Epic 4 (transaction table UI context) | None | ✓ Pass |

No backward dependencies, no circular dependencies, no forward references.

### Story Quality Assessment

**Story Sizing:** All 17 stories are appropriately sized — each delivers a coherent, independently completable unit of work. No mega-stories requiring decomposition.

**Acceptance Criteria Quality:** All stories use proper Given/When/Then BDD format. ACs are specific, testable, and include both happy path and error/edge cases. FR and UX-DR traceability is maintained inline within ACs.

| Story | ACs | Format | Testable | Error Cases | Verdict |
|---|---|---|---|---|---|
| 1.1 Project Setup | 4 AC groups | ✓ GWT | ✓ | N/A (setup) | ✓ Pass |
| 1.2 Computation Engine | 10 AC groups | ✓ GWT | ✓ (Vitest) | ✓ Invalid state | ✓ Pass |
| 1.3 FX Conversion | 6 AC groups | ✓ GWT | ✓ (Vitest) | ✓ Fallback, precision | ✓ Pass |
| 1.4 App Shell | 7 AC groups | ✓ GWT | ✓ | ✓ Empty states | ✓ Pass |
| 2.1 FMP Service | 5 AC groups | ✓ GWT | ✓ | ✓ API failure | ✓ Pass |
| 2.2 Dashboard | 6 AC groups | ✓ GWT | ✓ | ✓ N/A prices, loading | ✓ Pass |
| 2.3 Portfolio Selector | 7 AC groups | ✓ GWT | ✓ | ✓ Stale data, refresh fail | ✓ Pass |
| 3.1 Active Positions | 6 AC groups | ✓ GWT | ✓ | ✓ Empty state | ✓ Pass |
| 3.2 Closed Positions | 6 AC groups | ✓ GWT | ✓ | ✓ Invalid state (amber) | ✓ Pass |
| 4.1 Transaction Ledger | 7 AC groups | ✓ GWT | ✓ | ✓ Empty state | ✓ Pass |
| 4.2 Inline Editing | 7 AC groups | ✓ GWT | ✓ | ✓ Validation error, cancel | ✓ Pass |
| 5.1 Template & Upload | 4 AC groups | ✓ GWT | ✓ | ✓ Validation errors | ✓ Pass |
| 5.2 Validation Display | 4 AC groups | ✓ GWT | ✓ | ✓ Error persist, correction | ✓ Pass |
| 5.3 Duplicates & Import | 5 AC groups | ✓ GWT | ✓ | ✓ Rollback, success/fail | ✓ Pass |
| 6.1 Manual Add | 5 AC groups | ✓ GWT | ✓ | ✓ Validation, duplicate | ✓ Pass |
| 6.2 Delete & Bulk Delete | 7 AC groups | ✓ GWT | ✓ | ✓ Cancel, invalid state | ✓ Pass |

### Within-Epic Story Dependencies

All story dependencies flow forward (1→2→3→4 within each epic). No backward or circular dependencies.

- Epic 1: 1.1 → 1.2 → 1.3 → 1.4 ✓
- Epic 2: 2.1 → 2.2 → 2.3 ✓
- Epic 3: 3.1 → 3.2 ✓
- Epic 4: 4.1 → 4.2 ✓
- Epic 5: 5.1 → 5.2 → 5.3 ✓
- Epic 6: 6.1 → 6.2 ✓

### Database Creation Timing

🟡 **Minor concern:** Story 1.1 creates both `transactions` and `market_data` tables upfront. Under strict best practices, `market_data` should be created in Epic 2 when first needed (FMP integration). **However**, both tables are defined in a single Drizzle schema file and pushed together via `drizzle-kit push`. Splitting this would add artificial complexity. **Recommendation:** Accept as-is — pragmatic for a two-table schema.

### Best Practices Compliance Checklist

| Check | Epic 1 | Epic 2 | Epic 3 | Epic 4 | Epic 5 | Epic 6 |
|---|---|---|---|---|---|---|
| Delivers user value | 🟡 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Functions independently | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Stories appropriately sized | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| No forward dependencies | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| DB tables created when needed | 🟡 | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clear acceptance criteria | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| FR traceability maintained | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Quality Findings Summary

**🔴 Critical Violations:** None

**🟠 Major Issues:** None

**🟡 Minor Concerns:**
1. Epic 1 is primarily a technical foundation epic — Stories 1.1-1.3 are developer-facing. Mitigated by: (a) compute-on-read architecture makes engine a hard prerequisite, (b) user is the solo developer, (c) Story 1.4 delivers user-visible output.
2. Database schema created in full upfront in Story 1.1 rather than per-epic. Mitigated by: only 2 tables, single schema file, `drizzle-kit push` operates on entire schema.

### Recommendations

No remediation required. The two minor concerns are pragmatic trade-offs that are well-justified by the project context (solo developer greenfield project with compute-on-read architecture). The epic and story quality is high overall — proper BDD format, thorough ACs, complete FR/UX-DR traceability, no forward dependencies, and appropriate sizing.

## Summary and Recommendations

### Overall Readiness Status

**READY**

This project is ready for implementation. All planning artifacts are comprehensive, well-aligned, and cross-referenced. No critical or major issues were found.

### Assessment Summary

| Area | Status | Issues |
|---|---|---|
| Document Inventory | ✓ Complete | All 4 required documents present, no duplicates |
| PRD Analysis | ✓ Complete | 54 FRs + 6 NFRs clearly defined and traceable |
| Epic Coverage | ✓ 100% | All 54 FRs mapped to epics with full traceability |
| UX Alignment | ✓ Aligned | PRD ↔ UX ↔ Architecture fully consistent |
| Epic Quality | ✓ High | 2 minor concerns, both justified and mitigated |

### Critical Issues Requiring Immediate Action

None. No blocking issues were identified.

### Minor Items for Awareness (No Action Required)

1. **Epic 1 is a technical foundation epic** — 3 of 4 stories are developer-facing. Justified by compute-on-read architecture requiring the computation engine before any UI can display values. Story 1.4 provides user-visible output.
2. **Full database schema created upfront** — Both tables defined in Story 1.1 rather than per-epic. Justified by 2-table schema and `drizzle-kit push` operating on the complete schema.

### Recommended Next Steps

1. **Begin implementation with Epic 1, Story 1.1** — follow the architecture's specified initialization commands and implementation sequence
2. **Use the epics document as the sprint backlog** — stories are well-sized, properly ordered, and ready for execution as-is
3. **Validate computation accuracy early** — Story 1.2's Vitest tests are the single most important quality gate. Do not proceed to Epic 2 until computation tests pass against seed data

### Strengths of This Planning

- **Exceptional traceability:** Every FR traces from PRD → Epic → Story ACs with explicit FR/UX-DR references inline
- **Clear architecture:** Compute-on-read, Server Components + Server Actions, decimal.js precision, and pure computation functions are well-documented patterns
- **Thorough acceptance criteria:** All 17 stories use proper Given/When/Then format with error cases, edge cases, and code structure expectations
- **Consistent cross-referencing:** All four documents reference each other and maintain alignment
- **Risk mitigation documented:** FX gaps, FMP downtime, performance, and resource constraints all have explicit strategies

### Final Note

This assessment reviewed 4 planning artifacts across 6 validation steps. The project demonstrates thorough planning with 54 functional requirements, 6 non-functional requirements, 26 UX design requirements, 6 epics, and 17 stories — all fully traceable and aligned. Only 2 minor concerns were identified, both of which are justified pragmatic trade-offs. The project is ready for implementation.

**Assessed by:** Implementation Readiness Validator
**Date:** 2026-04-06
**Project:** Personal Portfolio Tracker
