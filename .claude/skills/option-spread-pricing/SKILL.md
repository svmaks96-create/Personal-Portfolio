---
name: option-spread-pricing
description: Structure, price and size a long options trade (call debit spread or long call) on a ticker from live IBKR chain data, then prepare the IBKR order instruction. Use when the user wants a bullish options trade, LEAPS or call-spread pricing, entry levels for a combo, or an options order prepared for review.
---

# Option spread pricing

Turn "go long X with options" into a policy-checked, desk-priced call debit
spread and a reviewable IBKR combo instruction. The output is a **theo**
(model fair value of the spread at the live spot), an entry **ladder** that
ends at a **ceiling** (= theo), and a sized order.

The pricing engine is [`price_spread.py`](price_spread.py) (stdlib only).
[`example-input.json`](example-input.json) is a worked input (CRWV, 2026-10-19).

## Preconditions

Load with ToolSearch before starting: IBKR `search_contracts`,
`get_price_snapshot`, `get_option_parameters`, `get_option_data`,
`get_account_trades`, `get_account_positions`, `get_combo_identifier`,
`create_order_instruction`, `get_order_instructions`, `get_account_orders`;
FMP `calendar`, `economics`; Tavily `tavily_search`. Without IBKR, stop and ask
the user to connect it.

IBKR snapshots are rate-limited to 10/s and 30/min. Send at most 8 in one batch.

## Steps

### 1. Underlying context
- `search_contracts`: pick the row whose `symbol` matches exactly, US listing,
  with OPT in its sections.
- Spot snapshot: `last`, `bid_ask`, `change`, `top_status`,
  `implied_vol_underlying`, `historical_vol`, `implied_volatility_percentile`,
  `misc_statistics`.
- **Session check:** convert `last.ts` to US Eastern time. Before 09:30 ET the
  spot is a pre-market print, and the options are not trading.
- Next earnings date (`fmp calendar earnings-company`). Why the stock moved
  recently (Tavily, `topic: news`, past week).
- Treasury curve (`fmp economics treasury-rates`). Interpolate the yield to the
  option's tenor; that is `rate_bey`.

Done when you have spot and its session, IV level and percentile, earnings
date, the recent catalyst, and the rate.

### 2. Policy and budget
Read **IPS Part V** in `docs/investment-policy.md`; it is the source of truth for
every number below. Check and report each item:
- **Underlying admitted?** The name must be underwritten in the active sleeve:
  an `allocation_targets` row with `bucket='active'`, or a current holding.
  If not, flag it as a policy exception and keep going.
- **Instrument and tenor** allowed by Part V.
- **Book** = holdings (net shares × latest `market_data` `stock_price`) + the sum
  of the `allocation_targets` cash rows' `cash_amount_usd`. Compute it with a
  `node -e` better-sqlite3 read; `transactions` uses `action` buy/sell and
  `instrument` stock/option.
- **Budget remaining** per the Part V formula. Build it from IBKR, not the
  ledger, because the ledger nets combos and hides losing positions:
  - open option premium at cost, from `get_account_positions`;
  - net realized option P&L year-to-date, from `get_account_trades`
    `YEAR_TO_DATE`, summing `realized_pnl` over OPT rows plus any stock legs
    from exercise or assignment (see the ARM precedent in memory).
- **Per-position cap** (% of book, from Part V). It covers every entry into the
  same position, including adds you plan later.
- Whether the Part V rule is currently in effect. Check the IPS changelog for a
  pending cooling period.
- **Correlation** with existing option positions or sleeve names (same theme,
  same selloff driver).

### 3. Chain snapshot
- `get_option_parameters`: pick the expiry. The standard January expiry 15–18
  months out is the default: deepest open interest, and it clears the Part V
  tenor minimum. Expiry ids and contract ids are internal; never show them.
- `get_option_data` bounded to about 0.75×–2.3× spot.
- Snapshot 10–13 calls (`bid_ask`, `top_status`, `option_open_interest`) from
  about 0.8× to 2.3× spot, plus 2–3 puts at or just below spot. The puts feed
  the parity check, so keep them away from deep in-the-money strikes.
- **Frozen check:** `top_status` `FROZEN_DELAYED` means the quotes are the
  prior session's close. Then `quote_spot` = prior close (`last − change`) and
  `quote_date` = the last session. Pricing frozen quotes against the live spot
  without re-marking is exactly the error this skill exists to prevent.

### 4. Price
Write the input JSON to the scratchpad, using the fields documented in the
script's docstring. List 4–8 candidate spreads, each with a long strike about
0–5% out of the money and a short strike about 40–60% above spot, plus
narrower or wider variants. Run:

```
PYTHONIOENCODING=utf-8 python -I <skill>/price_spread.py <scratchpad>/input.json
```

The script's method:
1. Recover the borrow/dividend yield from put-call parity.
2. Fit a weighted quadratic skew in log-moneyness.
3. Re-mark at the live spot three ways (sticky-strike, sticky-moneyness, and
   sticky-strike with an ATM vol move set by `spot_vol_beta`, default −0.5
   vol-pts per +1%). **Theo** is the average of the three.
4. Report spread delta, vega and theta, a spot × vol grid, and the ladder.

`spot_vol_beta` is an assumption; say so when you present the results.

### 5. Structure and size
- Pick the spread with the best breakeven per dollar whose short strike is a
  level the stock has actually traded at (a recent high or a pre-selloff
  level). State why it beat the runners-up.
- Size: `n@cap` from the script. If the stock reports earnings before expiry and
  the user wants room to add, split the entry: about half now, the rest after
  results, with the total inside the cap.
- Spread vega is usually small next to delta, so the entry price is mostly set
  by spot. Present it that way.

### 6. Present
Use this structure:
- **Inputs** table.
- **Strike** table: bid/ask, IV, fair value, delta.
- **Candidates** table: theo, R:R, breakeven %, probability above breakeven and
  at max (state that these are risk-neutral), n@cap, cost.
- **Recommendation** with a profit/loss-at-expiry row.
- **Grid** and **ladder**.
- **Policy flags**, put first if any are failing.

Done when every Step 2 check is reported and the user has a price ceiling at
several spot levels.

### 7. Order instruction
- First call `get_order_instructions` and `get_account_orders`
  (`show_completed: true`) so you don't duplicate anything.
- `get_combo_identifier`: long leg `size: 1`, short leg `size: -1`, using the
  `call_contract_id_ex` values verbatim.
- `create_order_instruction`: BUY, quantity = number of spreads, LIMIT, net
  debit, DAY. Use the user's price if they gave one; otherwise use the ladder
  start for the expected spot.
- Show the review URL. State the quantity explicitly, and whether it is the
  full position or the first entry, plus the cost, the max loss and gain, and
  how much room is left under the cap for adds.

## Execution guidance for the user
- Trade after about 10:00 ET. Options open at 09:30, and quotes are wide until
  the stock settles.
- Re-run the script with live leg quotes. Compare theo with the combo's own
  bid/ask, which is often tighter than the separate legs.
- Start at the ladder start and raise in small steps every 2–3 minutes up to
  the ceiling. If it doesn't fill there, walk away.
- If spot moves while the order works, shift the limit by the spread delta for
  each $1 the stock moves.
- If live IV is above the fit, lower the ceiling by |vega| for each vol point
  above.
