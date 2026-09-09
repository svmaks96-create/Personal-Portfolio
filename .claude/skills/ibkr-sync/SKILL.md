---
name: ibkr-sync
description: Sync recent IBKR trades into the portfolio DB, refresh outstanding option marks, and reconcile dividends against FMP's dividend calendar. Use when the user asks to sync IBKR, import recent trades, update option marks/prices, catch up dividends, or reconcile positions against the broker.
---

# IBKR Sync

Pull recent trades from the Interactive Brokers MCP connector, insert the ones missing
from `data/portfolio.db`, refresh option marks from live positions, reconcile every
ticker against the broker, and reconcile dividends (both portfolios) against FMP's
dividend calendar. All DB writes use one-off `node -e` / better-sqlite3 scripts
inside a transaction — never modify app code for this.

## Preconditions

- IBKR MCP tools must be available (load via ToolSearch: `get_account_trades`,
  `get_account_positions`). If absent, tell the user to connect the IBKR integration
  and stop.
- FMP MCP tool `mcp__fmp__calendar` (load via ToolSearch) for Step 6. If absent, skip
  Step 6 and say so in the report.
- Read `C:\Users\svmak\.claude\projects\A--Projects-Personal-Portfolio\memory\project_options_ibkr_conventions.md` if not already in context.

## Step 1 — Determine the sync window

Query the DB for the latest trade (action buy/sell) in the `Interactive Brokers`
portfolio. Pick the smallest `get_account_trades` period that covers the gap
(`DAYS_7` / `DAYS_30` / `DAYS_60` / `DAYS_90`); if the gap exceeds 90 days, also fetch
quarter periods (`LAST_QUARTER`, etc.) until covered.

## Step 2 — Transform IBKR trades to ledger rows

Apply these conventions (portfolio `Interactive Brokers`, currency `USD`):

| IBKR | Ledger rule |
|---|---|
| `sec_type: CASH` (FX conversions like USD.CHF, AED.USD) | **Skip** — never tracked. List in report. |
| Non-USD trades (e.g. VWRA in CHF on EBS, EVR in GBP on LSE) | **Skip** — never tracked. List in report. |
| `sec_type: WAR`, symbol GDEV | Ticker `GDEVW`, instrument `stock`. (General: warrant ticker = underlying + `W`; check the DB for the existing ticker before inventing one.) |
| `sec_type: STK` | Instrument `stock`. **Merge same-day same-side executions** per ticker: qty = Σ size, gross = Σ net_amount, fees = Σ commission rounded to 2dp. |
| `sec_type: OPT` | Instrument `option`, ticker = underlying. **Net ALL option executions per (underlying, day)** into one row: gross = \|Σ buy net_amounts − Σ sell net_amounts\|; action = `buy` if net debit, `sell` if net credit; quantity = max(Σ bought contracts, Σ sold contracts); fees = Σ commissions rounded to 2dp. |

- Negative fee totals (commission rebates) violate Zod (`fees >= 0`): fold the rebate
  into gross and set `fees = 0`, so the net cash is preserved. **The sign depends on
  the side**, because `computation.ts` uses cost = gross + fees for a buy but
  proceeds = gross − fees for a sell:
  - **buy** (net debit): `gross += fees` — the rebate lowers the cost.
  - **sell** (net credit): `gross -= fees` — i.e. gross rises; the rebate raises proceeds.

  Check the result against IBKR's summed `realized_pnl` for the executions before
  inserting. (Precedent 2026-09-01, MNDY close: gross 5300 credit, fees −1.05 →
  gross 5301.05 / fees 0 → realized +1971.45, matching IBKR exactly.)
- Anything that doesn't fit these rules (new sec_type, sell-to-open credit combo while
  no option position is held, etc.): do NOT guess — show the raw trades to the user
  and ask.

## Step 3 — Insert with duplicate guard

For each candidate row, skip if a row with the same
(date, ticker, action, instrument, quantity) already exists in the portfolio.
Insert the rest in a single SQLite transaction; print every inserted/skipped row.

## Step 4 — Refresh option marks

From `get_account_positions`, take rows with `asset_class: OPT`, group by underlying
symbol, and compute total value = Σ market_value (short legs are negative). For each
underlying with an open option position in the DB, upsert a mark:

```sql
DELETE FROM market_data WHERE symbol = '<TICKER>:OPT' AND type = 'option_mark' AND date = '<today>';
INSERT INTO market_data (symbol, type, date, value, fetched_at)
VALUES ('<TICKER>:OPT', 'option_mark', '<today yyyy-MM-dd>', <total>, '<ISO timestamp>');
```

Marks must be written AFTER inserting trades — a mark dated >= the last option trade
date is what makes it "fresh"; the app falls back to cost otherwise.
If the DB shows an open option position but IBKR shows none for that underlying,
flag it: a closing trade is probably missing (expiry/assignment leaves no trade record).

## Step 5 — Reconcile

Compare DB net share count per ticker (Σ buy qty − Σ sell qty, Interactive Brokers
portfolio, **stock instrument only**) against IBKR positions (warrant positions map to
the `W` ticker). Separately compare option-instrument net quantities against the count
of IBKR option spreads per underlying. Print an OK/MISMATCH table. Investigate any
mismatch before declaring success.

## Step 6 — Reconcile dividends (FMP-based)

The IBKR MCP has no cash-transactions endpoint, so dividends are reconciled against
FMP's dividend calendar instead — for BOTH portfolios (Wio is otherwise fully manual).
This was validated against the ledger on 2026-06-12; the per-ticker conventions below
were derived from the ledger's own historical rows.

**When deriving a convention from existing rows, check the AMOUNT, not just the row
shape.** A single row with no negative companion does not mean gross — divide the
booked amount by (DPS × shares-at-ex-date) and read the ratio. The 2026-06-12
derivation skipped this and read Wio's single net rows as gross, which overstated
seven Wio ETF dividends by 30% before it was caught and corrected on 2026-08-03.

1. **Scope:** every stock-instrument ticker that had > 0.01 shares (in either
   portfolio) at any point in the last 180 days. Window: ex-dates in the last 180 days
   — the duplicate check makes re-scanning covered ground harmless.
2. **Facts:** `mcp__fmp__calendar` endpoint `dividends-company` per ticker. Fields
   used: `date` (= ex-date), `paymentDate`, `dividend` (DPS). Non-payers return empty.
3. **Entitlement:** shares held at ex-date, per portfolio, by replaying
   buy/sell quantities (stock instrument only) up to and including the ex-date.
   Skip if < 0.01 shares.
4. **Expected ledger rows** (date = `paymentDate`, qty 0, fees 0, currency USD,
   instrument stock), following the ledger's per-ticker conventions:
   - **Wio:** one **NET** row: round2(DPS × shares × 0.70) for US payers — Wio nets
     the 30% US withholding at source and the statement shows only the net cash, so
     the ledger uses a single net row and never a separate withholding row.
     (Verified across 22 hand-entered rows 2024-06 → 2025-12, all at exactly 0.700×
     gross: VTI, VXUS, VIG, MSFT, QCOM.) Non-US payers follow the same single-net-row
     shape at their own rate — BABA (Cayman) is 1.00× i.e. gross (precedent
     2025-07-10). Do NOT book a gross amount for Wio.
   - **IBKR, US-domiciled payer** (MSFT, META, NVDA, CRM, MRVL, ETFs…): gross row
     round2(DPS × shares) **plus** a withholding row of −round2(30% of gross),
     same date/ticker.
   - **IBKR, TSM:** one NET row: round2(DPS × shares × 0.79) — 21% Taiwan
     withholding, single-row convention (precedents: 2026-01-08 = 11.31,
     2026-04-09 = 12.61).
   - **IBKR, ASML:** gross row + −15% withholding row (Dutch treaty rate;
     precedents 2026-02-18, 2026-05-05).
   - **IBKR, BABA** (Cayman): one gross row, no withholding (precedents 2024).
   - **Any payer with no precedent in the ledger and a non-US domicile:** show the
     user the expected gross and ASK for the withholding treatment — don't guess.
5. **Covered check:** an existing dividend row for (ticker, portfolio) dated within
   ±5 days of `paymentDate` → covered; if its amount differs from expected by > 5%,
   FLAG it in the report but do not insert or modify.
6. **Insert only if `paymentDate` <= today.** Ex-date passed but payment in the
   future → list under "Upcoming dividends" with expected net amount and pay date;
   they get picked up by the next sync after payment.
7. Inserts go in one SQLite transaction with a per-row duplicate guard; print every
   inserted/skipped/flagged row.

These rows are estimates at standard withholding rates — if a broker statement later
disagrees, correct the row to the statement (statement wins).

## Step 7 — Report

Summarize: rows inserted (table), marks updated with values, items deliberately
skipped (FX, non-USD), reconciliation result, dividends inserted / flagged /
upcoming, and remind the user that prices may need a Refresh in the app for current
stock quotes.
