---
name: portfolio-review
description: Re-underwrite the portfolio (or one sleeve) on forward merit — score each name's conviction and entry-timing, draft v3 thesis records (break conditions, horizon, entry/add-down/backstop levels), adversarially stress-test every call, and produce a rebalance read vs the bucket targets. Use for the quarterly review, after a big drawdown, when a price level or thesis-break trigger is hit, or when the user asks to re-score / re-underwrite / rebalance positions.
---

# Portfolio Review (re-underwriting engine)

Re-underwrite holdings on **forward merit only** and emit, per name, a **v3 thesis
record** (schema below). The policy source of truth is `docs/investment-policy.md`
(IPS v3) + `src/shared/policy.ts` — never restate or re-derive its numbers; read the
constants and follow them. Output lands in the app as **DRAFT rows in
`position_theses`**; Maksim reviews, edits, and finalizes on **/research** — that UI
action is the only path to a live thesis.

## Design principles (non-negotiable)

- **Forward-only.** Sunk cost is irrelevant. Down is never a reason to sell, up is never
  a reason to hold. No capital-gains tax — selling is free; the only reason to hold is
  forward conviction (incl. the Rebuild's zero-incumbency rule while it applies).
- **Two independent scores.** `conviction` = quality/durability of the business (drives
  target *weight* via the sizing ladder). `promiseRank` = attractiveness of the entry
  *today* (drives *timing* only — never weight).
- **Break-condition exits, not price stops.** Every active thesis names 2–4 **falsifiable**
  fundamental statements; any one verified true ⇒ full exit. The technical backstop is a
  price that forces a **re-underwrite within 7 days** — it is NEVER a sell signal.
- **No valuation trims.** The only trims are the 8% hard cap and conviction downgrades.
  Do not emit trim levels or price-target exits — they don't exist in v3.
- **Theses expire.** Every keep gets a 12–36 month horizon; at expiry: re-underwrite or
  exit. "It'll work eventually" belongs to the Engine.
- **Don't guess — ask.** Private/illiquid/no-data names get flagged and reasoned from
  what exists; never fabricate multiples or targets.

## The framework (IPS v3 — constants live in `src/shared/policy.ts`)

The numbers below are a convenience copy. **If any number here disagrees with
`src/shared/policy.ts`, the code wins** — read the constants at the start of every
run; nothing pins this file the way `policy.test.ts` pins the IPS doc.

- **Buckets:** Engine (passive core) 57 / Active 35 / Options 3 (premium budget at cost)
  / Cash 5. The core target is a floor that only ratchets up via the kill switch.
- **Active sleeve:** 6–8 names. Ladder: conviction 5 → 5.5% · 4 → 4.5% · 3 → 3.5% ·
  below 3 → no slot (cut or never enter). Min 3% (top up or exit), hard cap 8%
  (mandatory trim to target). Sector cap 14 pts of book (FMP sector; **correlated theses
  count as one sector** — set the risk-group override on the record when they do).
- **Admissions:** 7-day cooling period between finalized underwriting and first buy ·
  max 2 new names/quarter · a full sleeve admits only by displacement (the change reason
  must name the displaced incumbent). The Rebuild transition (IPS v3.2) waives caps.
- **Adds:** ONE pre-committed add-down per position, ever — level + max size + a
  thesis-intact condition. Never average into a break.
- **Rebalancing:** bucket band ±5 pts; contributions-first; the ladder is reconciled to
  the 35% bucket by `reconcileActiveTargets` in the app — you never write weights.

## Preconditions

- **IBKR MCP** (load via ToolSearch): `get_account_positions`, `get_account_balances`.
  If absent, tell the user to connect IBKR and stop.
- **FMP MCP** (load via ToolSearch as needed per name): `quote`, `technicalIndicators`,
  `analyst`, `statements`, `company`, `calendar`, `news`; for drafting/verifying
  **break conditions** prefer primary sources — `earningsTranscript` and `secFilings` —
  and use web search (Tavily) for thesis-break headlines where FMP news is thin
  (non-US names especially). Graceful degradation if a name has no data.
- Read `C:\Users\svmak\.claude\projects\A--Projects-Personal-Portfolio\memory\project_options_ibkr_conventions.md` if not already in context.

## Step 1 — Gather current state

1. `npx tsx scripts/portfolio-snapshot.ts` → computed, USD-normalized positions.
2. Live IBKR positions + cash to reconcile; `allocation_targets` cash rows for Wio.
3. Prior records: `SELECT * FROM position_theses WHERE is_current = 1` (and any pending
   drafts — if a ticker already has a draft, UPDATE that draft in place rather than
   inserting a second one; the app enforces one draft per ticker). The review is
   **incremental**: compare new scores/levels to the prior version and write the delta
   into `change_reason`.
4. Watchlist mode: if the `watchlist` table exists, names with
   `status = 'flagged_for_research'` join the review set, with their
   `screening_results` metrics as research input.
5. **No improvised screening.** If asked to screen the universe for new candidates
   before the app's `/screening` page exists (Phase 3), say so and stop — do not
   improvise an ad-hoc FMP screen or create watchlist/screening tables. Screening
   is deterministic and in-app by design (construction doc §2).

## Step 2 — Build the name list + per-name input

One underwriting unit per equity/ETF position (stock + its option overlay on the same
underlying = one unit; standalone option/warrant structures are "cleanup" units judged
on salvage). For each: shares, avg cost, last price, MV, % of total, bucket, prior
record.

## Step 3 — Underwrite each name (fan out)

Prefer the **Workflow tool** (one agent per name, parallel) when available; otherwise
sequential. Each agent gets the framework, the name's economics + prior record, and:

> Re-underwrite ONE position on forward merit for IPS v3. Confirm or change its
> **bucket** (`core` | `active`) on business quality / thesis durability — never on
> whether it is up or down. Core ETFs carry **no** scores, levels, break conditions, or
> horizon (no opinions in the Engine). For active names: set **conviction (1–5)** and
> **promiseRank (1–5)** per the rubrics; **keepDecision** (`keep` | `cut`); a
> **horizonMonths** (12–36) the thesis is actually underwritten for; a one-paragraph
> **thesis** (why this name holds a slot on forward merit), its **keyRisk**, and the
> **catalyst** expected inside the horizon — these three narrative fields are the core
> of the /research draft card, never leave them empty; **2–4 falsifiable
> break conditions** (statements a reasonable person could verify true/false — "loses
> the EUV monopoly", not "fundamentals deteriorate"); an **entry zone** (band + one-line
> rationale anchored to 50/200-DMA + valuation); ONE **add-down** (next major support,
> max size % of book, thesis-intact condition); a **technical backstop** (structure-break
> price that forces re-underwrite within 7 days — not a sale); the **FMP sector** (plus
> a risk-group override if this thesis is correlated with another holding's);
> **technicalContext** (50/200-DMA, 52w range, analyst target used). Research with FMP
> MCP. ANALYSIS ONLY — never place or stage a trade.

### Conviction rubric (1–5) — quality of the business/thesis
Score four pillars — moat/quality, financial strength, growth durability, valuation
support — then **cap for structural risk** (geopolitical, regulatory/delisting,
balance-sheet fragility, single-catalyst dependence, unproven durability).
- **5** — wide moat + fortress balance sheet + durable growth + non-extreme price + no
  structural tail (rare; a 4 is the realistic ceiling for a richly-valued mega-cap).
- **4** — high-quality franchise, thesis intact, **one** significant offset.
- **3** — real thesis but unproven durability, or single-catalyst, or a major
  structural risk — the minimum for a slot.
- **2** — weak/broken thesis, mostly optionality → cut.
- **1** — no forward thesis → cut.

### promiseRank rubric (1–5) — quality of the entry, right now
Combine (a) valuation vs the name's own history/targets, (b) technical setup vs the
50/200-DMA and distance to support, (c) risk/reward to the entry zone. Independent of
conviction; drives which underweights to fill first, never weight.
- **5** washed out + near strong support + large upside · **4** good entry · **3**
  neutral / wait · **2** extended or falling-knife · **1** avoid adding.

### Thesis record schema (v3 — mirrors `position_theses`)
`ticker · bucket(core|active) · sector(+ risk-group override) · conviction(1–5) ·
promiseRank(1–5) · keepDecision(keep|cut) · targetWeightPct(ladder value) · thesis ·
keyRisk · catalyst · breakConditions[2–4] · horizonMonths(12–36) · entryZoneLow/High +
entryNote · addLevel + addMaxSizePct + addNote · technicalBackstop + backstopNote ·
technicalContext · changeReason(delta vs prior; displacement admissions name the
displaced incumbent) · critiqueVerdict + critiqueCounter`

## Step 4 — Adversarial critique (BEFORE presenting)

A skeptic argues the opposite of the implied action with its own FMP research for:
every **CUT**, every **ADD/new admission**, and — because the zero-incumbency rule
means complacent keeps are where confirmation bias hides — every **KEEP at
conviction 3** and every keep whose conviction **rose** vs the prior version.
Judge whether the call survives. Record `critique_verdict` (`survives` |
`overturned` — if overturned, fix the record before drafting) and
`critique_counter` (the strongest counter-argument, verbatim). Uncritiqued keeps
carry NULL critique fields — that's expected, not an omission. These fields render
prominently on /research — Maksim reads the counter before scoring.

## Step 5 — Synthesize

Produce: (1) roster table — ticker · bucket · conv/rank · keep/cut · ladder% · today% ·
posture; (2) the levels + break-conditions rulebook; (3) bucket roll-up vs the 57/35/3/5
targets with deltas; (4) a concrete action list (cuts, adds, gated/"wait" names) with
approximate $; (5) the active-sleeve prune to 6–8 names within the sector cap.

## Step 6 — Persist drafts & report

Write records to `data/portfolio.db` via one `node -e` better-sqlite3 transaction.
**The contract (violating it corrupts the review pipeline):**

- **Upsert, never a second draft.** The one-draft-per-ticker invariant lives in the
  app's actions layer, which your raw SQL bypasses — enforce it yourself: if a
  `status='draft'` row exists for the ticker, UPDATE that row in place (keep its
  `version`); otherwise INSERT with
  `version = COALESCE((SELECT MAX(version) FROM position_theses WHERE ticker=?),0)+1`.
- INSERT/UPDATE with `status='draft'`, `source='portfolio_review'`, `is_current=0`,
  `add_down_state='available'`, `break_conditions` = JSON array string,
  `target_weight_pct` = the ladder value (drafts carry the raw rung; finalize
  re-derives/reconciles), `created_at` = ISO now, `reviewed_at` = NULL, critique
  fields per Step 4 (NULL on uncritiqued keeps), `change_reason` = one-line delta vs
  the prior version — on version 1 it is the admission rationale instead (naming the
  displaced incumbent when the sleeve is full).
- If the `watchlist` table exists and the name came from it: in the same transaction,
  `UPDATE watchlist SET status='researched' WHERE ticker=? AND status='flagged_for_research'`.
- **NEVER** set `status='final'`, touch `reviewed_at`/`expires_at`, write
  `allocation_targets.target_weight`, `app_settings.cash_target_weight`, or
  `add_down_state` beyond the initial `available`.
- **Never place or stage trades.** The user executes in IBKR.

Close the report with: review and finalize the drafts at **/research** — targets flow
to /allocation via the Apply button there, and /construction shows the resulting
violations and triggered levels.
