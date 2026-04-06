---
title: "Product Brief Distillate: Personal Portfolio Tracker"
type: llm-distillate
source: "product-brief-personal-portfolio.md"
created: "2026-04-03"
purpose: "Token-efficient context for downstream PRD creation"
---

# Product Brief Distillate: Personal Portfolio Tracker

## Competitive Intelligence

- **Sharesight** — strong CSV import and broker email sync, good global support. Weakness: expensive past free tier (10 holdings cap), weak US tax optimization, no alternative/private asset support
- **Capitally** — best-in-class CSV/Excel import with reusable column-mapping. Weakness: small user base, limited auto-sync, relatively new/unproven
- **Empower (fka Personal Capital)** — excellent multi-account aggregation via Plaid. Weakness: requires broker credentials, limited manual trade import, no granular cost-basis or lot-level tracking from historical trades
- **Kubera** — connects 30,000+ institutions including crypto. Weakness: $150/yr, no CSV trade reconstruction, snapshot-based not trade-based
- **Portfolio Slicer** — free Excel-based tracker. Weakness: no automation, steep learning curve, no web/mobile, fully manual
- **Common gap across all competitors:** none reconstruct positions from full trade history via simple Excel import without credential sharing

## Requirements Hints

- **Excel template fields:** date, ticker, action (buy/sell/dividend), quantity, price, fees, portfolio name, currency — user confirmed this set
- **Import validation is critical:** duplicate detection, required field checks, format validation, clear error surfacing. User's #1 priority is seamless import
- **Transaction editing must propagate:** editing a historical trade recomputes all downstream positions — effectively event-sourced architecture
- **Position metrics per row:** average entry price, shares held, cost basis, current market value, dividends received, sell proceeds, total P&L
- **Dashboard metrics:** total portfolio value, total cost basis, total P&L, cash returned — per portfolio and aggregate
- **Filtering:** positions table filterable by portfolio; transactions page filterable by portfolio AND ticker
- **FX rate matching is date-specific:** cost basis uses trade-date FX, market value uses price-date FX (not "current" — if price is from Friday, FX is from Friday), dividends use payment-date FX
- **Weighted average cost method** confirmed for MVP — FIFO/specific lot may come later
- **Localhost only** — no auth needed, no network exposure

## Technical Context

- **FMP API (FinancialModelingPrep)** is the sole data provider — stock prices, FX rates, dividend calendars. No abstraction layer needed; user has no plans to switch providers
- **FMP free tier is rate-limited;** paid plans start ~$14/mo. User already has FMP access (MCP server configured)
- **No direct broker integrations** — Excel template is the only import path for MVP
- **Single-user, localhost deployment** — no auth, no multi-tenancy considerations

## Scope Signals

**Confirmed IN for MVP:**
- Dashboard, positions table, transactions page (three distinct views)
- Excel template download + upload import flow
- Position reconstruction from trades (buys, sells, dividends)
- Multi-currency with USD base
- Live pricing and FX from FMP
- Transaction inline editing

**Confirmed OUT for MVP:**
- Corporate actions (splits, mergers, spin-offs) — not prioritized for near-term either
- DRIP / dividend reinvestment
- Cash balance / cash flow tracking — only stock transactions tracked
- Broker API integrations
- IRR, benchmarking, AI analysis
- Multi-user / authentication
- Mobile-specific UI
- Reconciliation checks against broker balances (manual verification is sufficient)
- FMP provider abstraction layer

**Future roadmap (user-stated order of interest):**
1. IRR calculations
2. Benchmarking against indices
3. AI-powered analysis
4. Richer visualizations
5. Automated imports (broker CSV adapters)
6. Corporate action handling

## Rejected Ideas and Decisions

- **Reconciliation feature for MVP** — rejected. User prefers manual verification against broker statements rather than building a cross-check mechanism
- **FMP abstraction layer** — rejected. No plans to use alternative data providers; direct FMP integration is acceptable
- **FIFO/specific lot identification** — deferred. Weighted average cost is sufficient for current needs
- **Snapshot-based position tracking** — rejected by design. Trade-level reconstruction is the core architectural decision
- **Broker credential sharing (Plaid etc.)** — rejected. Privacy and data ownership are core values
- **"Current" FX rate for market value** — rejected. FX rate must match the date of the fetched price for accuracy

## Open Questions for PRD Phase

- **Database choice** — not discussed. Event-sourced trade history suggests a relational DB but no preference stated
- **Tech stack** — frontend/backend frameworks not specified. User is intermediate skill level
- **Excel template versioning** — how to handle template format changes as new transaction types are added later
- **Partial sell mechanics** — weighted average cost reduces proportionally, but exact UX for displaying realized vs unrealized P&L per position not fully defined
- **FMP API failure handling** — what the UI shows when FMP is unreachable or rate-limited (stale prices? error state?)
- **Import idempotency** — can the same file be imported twice safely? How are duplicates across multiple imports detected?
- **Closed positions** — how are fully divested positions displayed? Separate section, filtered out, or shown with zero shares?

## User Profile

- Self-directed investor managing positions across multiple brokers
- Currently tracks via Excel spreadsheets and individual broker apps
- Intermediate technical skill level
- Motivated to build custom tool because Excel is hard to adjust and cannot support future AI features
- Values: accuracy of calculations above all, seamless import experience, data ownership
- Building for personal use only — no commercial intent
