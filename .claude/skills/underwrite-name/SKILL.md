---
name: underwrite-name
description: Re-underwrite a SINGLE position (or a watchlist candidate) on demand — score its conviction and entry-timing, draft a v3 thesis record (break conditions, horizon, entry/add-down/backstop levels) for review at /research. Use when one name reports earnings, hits a price level or backstop, its thesis expires, a thesis-break headline lands, or the user asks "re-score / re-underwrite / what's my level on <ticker>".
---

# Underwrite a single name

A focused, single-name version of the `portfolio-review` engine.
**Read `.claude/skills/portfolio-review/SKILL.md` before starting** — this skill uses
its **identical IPS v3 framework, rubrics, sizing ladder, level-anchoring rules,
thesis record schema, and persistence contract** verbatim; never work from memory of
them, and never re-derive them. This skill scopes the work to one name and keeps the
output incremental against the prior `position_theses` version.

## Design principles
Same as `portfolio-review`: forward-only, two independent scores, **break-condition
exits** (2–4 falsifiable statements; the technical backstop demands a re-underwrite
within 7 days, never a sale), **no valuation trims**, 12–36 month horizons with expiry,
one pre-committed add-down, don't-guess-ask on no-data names.

## Preconditions
- **FMP MCP** (load via ToolSearch): `quote`, `technicalIndicators`, `analyst`,
  `statements`, `company`, `calendar`, `news`; for drafting/verifying **break
  conditions** prefer primary sources — `earningsTranscript` and `secFilings` — and
  use web search (Tavily) for thesis-break headlines where FMP news is thin.
- For a currently-held name: live IBKR position (`get_account_positions`) + its computed
  row from `npx tsx scripts/portfolio-snapshot.ts`.
- Load the prior record: `SELECT * FROM position_theses WHERE ticker=? ORDER BY version
  DESC` — the current final is the starting point; if a **draft** already exists, update
  it in place. The one-draft-per-ticker invariant lives in the app's actions layer,
  which skill SQL bypasses — you must enforce it yourself.

## Modes
- **Held name** — the default: re-underwrite an existing position.
- **Watchlist candidate** — the name has `watchlist.status='flagged_for_research'`
  (once the watchlist table exists): pull its `screening_results` metrics from the
  flagging run as research input, underwrite to the same full standard, and flip its
  watchlist status to `researched` in the same transaction as the draft insert.
  Remind the user that a new name's first buy waits out the 7-day cooling period after
  finalization, and that admission caps (2/quarter, displacement when the sleeve is
  full) apply outside the Rebuild.

## Steps
1. **Assemble context** — position economics (if held), bucket, prior thesis version,
   pending triggers (expired horizon? backstop crossed? add-down consumed?).
2. **Research (FMP)** — quote, 50/200-DMA, 52w range, analyst targets & rating trend,
   valuation/FCF/margins/balance sheet, next earnings + material news.
3. **Score & structure** — conviction + promiseRank per the rubrics; keepDecision;
   horizonMonths; 2–4 falsifiable break conditions; entry zone; the ONE add-down
   (level, max size, thesis-intact condition); technical backstop; sector (+ risk-group
   override if correlated with another holding's thesis).
4. **Adversarial critique** — argue the opposite of the implied action with FMP
   evidence BEFORE presenting; record `critique_verdict` + `critique_counter`.
5. **Diff vs prior** — call out every change in bucket, scores, keep/cut, horizon,
   break conditions, or levels; that delta becomes `change_reason`.
6. **Persist the draft & report** — insert the DRAFT row per the `portfolio-review`
   persistence contract (never `final`, never allocation weights, never trades), then
   present the record + diff and close with: finalize at **/research**; apply the
   target to /allocation from there.

- **No improvised screening.** If asked to find/screen new candidates before the app's
  `/screening` page exists (Phase 3), say so and stop — do not improvise an ad-hoc FMP
  screen or create watchlist/screening tables. This skill underwrites a named ticker;
  screening is deterministic and in-app by design.

## Notes
- If the new score changes the name's ladder weight, say what the sleeve looks like
  after `reconcileActiveTargets` (35% bucket binds) — but the weight write happens only
  via /research → Apply, never here.
- A single-name change can breach the 6–8 count or the 14-pt sector cap — flag it and
  point at `/portfolio-review` rather than silently rebalancing the book.
- Keep it proportionate: one name is inline work, no multi-agent fan-out.
