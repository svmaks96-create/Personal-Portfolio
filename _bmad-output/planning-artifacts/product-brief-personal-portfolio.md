---
title: "Product Brief: Personal Portfolio Tracker"
status: "complete"
created: "2026-04-03"
updated: "2026-04-03"
inputs: [user conversation, web market research]
---

# Product Brief: Personal Portfolio Tracker

## Executive Summary

Managing investments across multiple brokerage accounts is a fragmented experience. Each broker offers its own dashboard, its own calculations, and its own blind spots. For a self-directed investor holding positions across several brokers, there is no single place to see the true, consolidated picture — total exposure, real cost basis, actual P&L — without handing over login credentials to a third-party aggregator or maintaining brittle spreadsheets.

Personal Portfolio Tracker is a web application that reconstructs an investor's complete portfolio from historical trade data. Users import transactions via a standardized Excel template — no broker credentials required — and the app computes each position's current state: average entry price, cost basis, market value, cash returned, and total P&L. Live pricing and FX conversion are powered by the FinancialModelingPrep (FMP) API, with USD as the base currency.

The MVP delivers three core views: a dashboard with portfolio-level and aggregate metrics, a positions table filterable by portfolio, and a full transaction ledger with editing capabilities. Built for one user — its creator — this tool is designed to be the foundation for advanced analytical features (IRR, benchmarking, AI-driven analysis) in later iterations.

## The Problem

Self-directed investors with positions across multiple brokers face a daily friction: no unified view of their holdings. The workarounds are painful:

- **Broker apps** show only their own accounts. Comparing performance across brokers means switching between apps and doing mental math.
- **Spreadsheets** work until they don't — formulas break, manual updates get skipped, and there's no path to automation or advanced analytics.
- **Aggregation tools** (Empower, Kubera, Sharesight) either require sharing broker credentials via Plaid, charge escalating fees, or take portfolio snapshots rather than reconstructing positions from actual trade history — leading to inaccurate cost basis and P&L.

The core frustration: existing tools either compromise privacy, sacrifice accuracy, or cap out at basic functionality.

## The Solution

A localhost web application with three core pages and an import flow:

**Dashboard** — Select a specific portfolio or view the aggregate across all brokers. See total portfolio value, total cost basis, total P&L, and cash returned at a glance. All values converted to USD using live FX rates.

**Positions Table** — Every discrete holding, showing: average entry price, number of shares, cost basis, current market value, dividends received, proceeds from partial/full sells, and total P&L. Filterable by portfolio. Each position is computed from the full history of buy/sell transactions — not from a broker snapshot.

**Transactions Page** — The complete ledger of all imported trades. Filter by portfolio and ticker. Edit individual transactions to fix import errors without re-importing. This is the source of truth — everything else is derived.

**Import Flow** — Download a standardized Excel template, fill in transactions (date, ticker, action, quantity, price, fees, portfolio, currency), and upload. The app validates incoming data (required fields, duplicate detection, format checks) and recomputes all positions. Validation errors are surfaced clearly so the user can correct and re-import.

## Position Computation Model

Positions are reconstructed from the complete transaction history using a **weighted average cost** method:

- **Average entry price** = total cost of all purchases / total shares purchased
- **Cost basis** = average entry price x current shares held
- When shares are sold, cost basis is reduced proportionally using the average cost at time of sale
- **Dividends received** are tracked as cumulative cash income per position
- **Proceeds** from partial or full divestments are tracked separately
- **Total P&L** = (current market value + total dividends received + total sell proceeds) - total amount invested

**Multi-currency handling:**
- Cost basis is recorded in the transaction's original currency, converted to USD at the trade-date FX rate
- Current market value is converted to USD at the FX rate as of the price date (e.g., if the latest price is from last Friday, FX rate from last Friday is used)
- Dividends are converted at the FX rate as of the dividend payment date
- FX rates sourced from FMP API

## What Makes This Different

**Trade-level reconstruction over snapshots.** Positions are computed from historical transactions, not captured as point-in-time snapshots. This means cost basis, average price, and P&L are always accurate and auditable — you can trace any number back to the trades that produced it. This is effectively an event-sourced architecture where the transaction ledger is the single source of truth and all portfolio state is derived.

**No credential sharing.** Import via Excel template means no Plaid integration, no broker logins stored anywhere, no third-party access to financial accounts.

**Foundation for advanced analytics.** The trade-history-first architecture creates a clean data foundation for future features — IRR calculations, benchmark comparisons, and AI-powered portfolio analysis — that snapshot-based tools cannot support.

## Who This Serves

**Primary user:** A self-directed investor (the builder) managing positions across multiple brokers, comfortable with Excel, wanting accurate consolidated reporting without credential-sharing tools or brittle spreadsheets. Values accuracy and data ownership over convenience features.

## Success Criteria

- Positions table matches broker statements for cost basis, share count, and P&L (using weighted average cost method)
- Dashboard displays accurate aggregate and per-portfolio values in USD
- Import flow validates data and surfaces errors clearly — no silent data corruption
- Transaction editing correctly propagates changes to all computed positions
- Multi-currency positions convert accurately using date-matched FX rates (trade-date for cost, price-date for market value, payment-date for dividends)
- Responsive, well-designed web interface with clear data presentation

## Scope

**MVP includes:**
- Dashboard with portfolio selector and aggregate metrics
- Positions table with all specified columns, filterable by portfolio
- Transactions page with filter and inline edit capability
- Excel template download, validation, and import
- Live stock prices and FX rates via FMP API
- Multi-currency support with USD base currency
- Position computation from historical trades (buys, sells, dividends received) using weighted average cost

**Explicitly out of scope:**
- Corporate actions (splits, mergers, spin-offs)
- Dividend reinvestment (DRIP) tracking
- Cash balance / cash flow tracking
- Direct broker API integrations
- IRR, benchmarking, or AI analysis features
- Multi-user support or authentication
- Mobile-specific UI

## Vision

The MVP establishes the data foundation and core experience. With an accurate, trade-sourced position model in place, later iterations can layer on:

- **Internal rate of return (IRR)** per position, portfolio, and aggregate
- **Corporate action handling** — stock splits, mergers, spin-offs
- **Benchmark comparison** against indices (S&P 500, etc.)
- **AI-powered analysis** — portfolio risk assessment, concentration alerts, rebalancing suggestions
- **Richer visualizations** — allocation charts, performance over time, sector exposure
- **Automated imports** — broker CSV format adapters, reducing manual template work

The long-term vision is a personal investment command center — private, accurate, and intelligent.
