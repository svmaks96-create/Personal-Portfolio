---
name: allocation-sync
description: Reconcile the /allocation target model against the real ledger — add tickers now held but missing from the model, retire rows for names that were sold, refresh cash balances, and verify target weights still sum to 100. Use when the user asks to sync/update/fix the allocation page, says the allocation model is out of date or missing tickers, or after an ibkr-sync or a buy/sell of a new name.
---

# Allocation Sync

Keep `allocation_targets` (the /allocation page) in step with what is actually held in
`data/portfolio.db`. This skill **reconciles membership and cash**, not conviction: it
never invents a target weight — new names land at 0% and get flagged for underwriting.

All DB writes use one-off `node -e` / better-sqlite3 scripts inside a transaction —
never modify app code for this.

## Design principles (non-negotiable)

- **A missing row is a bug; a 0-share row is a decision.** Anything held must appear in
  the model. Anything in the model but not held may be deliberate (a name you want to own
  and haven't bought yet) — so removals are always confirmed, additions are not.
- **Never invent a target weight.** New rows get `target_weight = 0`. Weights come from
  the sizing ladder in `portfolio-review` / `underwrite-name`, not from this skill.
- **Weights must always sum to 100.** `Σ ticker target_weight + app_settings.cash_target_weight`
  = 100. Adding at 0% preserves this; deleting a non-zero row breaks it — see Step 5.
- **Confirm before every write.** Present the full diff, get an explicit go-ahead, then apply.

## Step 1 — Run the diff

```bash
npx tsx scripts/allocation-diff.ts
```

Read-only. Reuses the app's exact computation chain, so market values and real weights
match the /allocation page cell-for-cell. Returns JSON with:

| Key | Meaning |
|---|---|
| `totals` | portfolio value, ticker target sum, cash target weight, `balanced` (sum == 100) |
| `missingFromModel` | held today, no ticker row — includes `optionOnly` flag |
| `unheldInModel` | model row with no live stock position; `status` = `sold` \| `never_owned` |
| `cashRows` | each cash row's stored USD amount, real weight, and `updatedAt` |
| `model` | every ticker row with live value, real weight, and drift vs target |

If the app dev server has stale prices, values may lag — that affects only the reported
weights, never the membership diff. Tell the user to hit Refresh in the app if drift
numbers look off.

## Step 2 — Classify each finding

Apply these rules verbatim. Do not improvise a category.

| Finding | Action |
|---|---|
| `missingFromModel`, `optionOnly: false` | **ADD** row: kind `ticker`, name = ticker (uppercase), `target_weight` 0, `bucket` NULL, `cash_amount_usd` NULL. Flag "needs bucket + underwriting". |
| `missingFromModel`, `optionOnly: true` | **DO NOT ADD.** The page prices only the stock leg, so an option-only row would read $0 / 0% forever. Report it under "not modelled" and move on. |
| `unheldInModel`, `status: never_owned`, weight > 0 | **LEAVE.** This is an unfilled target — a name you want to own. Report the $ needed to fill it. |
| `unheldInModel`, `status: sold`, weight > 0 | **ASK.** Sold but still carrying a target: either a deliberate re-entry target or a stale row from an exit. Offer keep / zero-out / delete. |
| `unheldInModel`, weight == 0 (either status) | **PROPOSE DELETE.** No position and no forward intent — a dead row. Confirm before deleting. |
| `totals.balanced: false` | **FLAG.** Report the gap and where it came from; do not fix silently. |

Large drift on a held name (`|driftPct|` beyond ~±0.5× the target, or a name above
~1.5× its target) is **not** this skill's job to fix — mention it and point at
`portfolio-review` for a rebalance.

## Step 3 — Refresh cash rows

Cash amounts are manual snapshots and go stale silently.

1. `IBKR Cash USD` — load `mcp__claude_ai_Interactive_Brokers_IBKR__get_account_balances`
   via ToolSearch and take the USD settled/total cash. If the IBKR MCP is unavailable,
   skip and say so.
2. Wio rows (`Wio AED Savings`, `Wio USD Account`) — no API. If any row's `updatedAt` is
   more than ~7 days old, ask the user for the current balance; if they don't have it,
   leave the row untouched and report its age. AED balances are stored **already
   converted to USD** — ask for the USD figure or convert explicitly and say the rate used.

Never delete or create cash rows automatically; the set of accounts is the user's call.

## Step 4 — Present the plan and get approval

One table of proposed changes: `action · row · from → to · why`. Then stop and wait.
Nothing is written until the user says go.

## Step 5 — Apply

Single `node -e` script against `data/portfolio.db`, one `better-sqlite3` transaction.
Rules:

- `sort_order` for new rows = `MAX(sort_order) + 1` (the UI has no reorder control, so
  order is cosmetic; ticker rows render before cash rows regardless).
- Set `created_at` / `updated_at` to `new Date().toISOString()`; touch `updated_at` on
  every UPDATE.
- The unique index `allocation_targets_kind_name_idx` on (kind, name) makes re-runs safe —
  guard each insert with a `SELECT` on (kind, name) and skip existing.
- **If a delete removes a non-zero weight**, the ticker sum now falls below 100. Do not
  redistribute silently: tell the user the shortfall and ask where it goes (usually
  `app_settings.cash_target_weight`, updated as a string with a fresh `updated_at`).
- Print every inserted / updated / deleted / skipped row.

## Step 6 — Verify and report

Re-run `npx tsx scripts/allocation-diff.ts`. Confirm `missingFromModel` is empty (apart
from deliberately-skipped option-only names), `totals.balanced` is true, and the intended
rows exist. Then report:

1. Rows added (with "target 0% — needs underwriting"), removed, and cash refreshed.
2. Names deliberately not modelled (option-only) and why.
3. Unfilled targets — in the model, not held, with the $ needed.
4. Any weight-sum gap left open.
5. If anything was added at 0%, close with: assign a bucket at /allocation, then run
   `/underwrite-name <TICKER>` to draft its thesis (conviction, break conditions,
   levels) for review at /research — or `/portfolio-review` if several names changed.
   This skill never sets `bucket`, target weights, or thesis fields itself.
