# Portfolio Construction Module — Development Document

Status: **Phases 0–2 built · Phases 3–5 spec, aligned to IPS v3** · Owner: Maksim ·
Last updated: 2026-08-04

Working spec for the portfolio construction module. Development happens in
independently shippable phases; the phase log at the bottom is the history —
the body of this document always describes the **current** design, never a
superseded one. The policy this module enforces lives in
`docs/investment-policy.md` (IPS v3) + `src/shared/policy.ts`; this document
never restates policy numbers — it references the constants.

---

## 1. Why

The tracker records what happened (ledger → positions → analytics). The IPS now
defines what *should* happen — buckets, sizing ladder, admission rules, break
conditions, thesis horizons, crash protocol, kill switch. This module makes the
policy **operational**: persisted theses, a screening → watchlist → underwriting
funnel, and advisory engines that surface every violation, triggered level, and
review demand the IPS defines. Still missing today (post-Phase 2):

- no watchlist storage, no screener, no quant scoring (Phase 3),
- no tracking of admission throughput, options budget, or kill-switch alpha
  (Phase 5) — add-down state and thesis expiry ARE tracked since Phase 2.

## 2. Agreed design decisions

| Question | Decision |
|---|---|
| How automated is scoring? | Mostly automated: system produces thesis/break conditions/catalysts/risks; an internal adversarial critique runs **before** presenting; Maksim reviews the refined draft and sets **final** conviction/promiseRank. |
| Where does LLM work run? | **Claude Code skills → write drafts to the app DB.** No in-app Anthropic API. The app does all deterministic/quant work. |
| Universe | US-listed incl. ADRs, market-cap + liquidity floors (FMP `/company-screener`; endpoint verified live). |
| Funnel depth | Quant pre-score the whole screened universe in-app; **Maksim picks from quant ranks** which names get LLM underwriting. |
| Enforcement | **Advisory only.** Dashboard surfaces violations, drift, triggered levels, review demands. No order placement, no auto-fixes. |
| Policy storage | **Typed constants** (`src/shared/policy.ts`) + prose IPS. No policy DB table or admin UI. `policy.test.ts` pins doc↔code agreement. |
| Integration | New pages in the existing Next.js app: `/construction`, `/screening`, `/research`. |
| Thesis versioning | Single append-only `position_theses` table (`version` + `is_current` + `status`). No separate history table. |
| Price levels & break conditions | Columns on `position_theses` — same underwriting act; versioning gives history for free. |
| Screening scores | Stored per run — a dated external snapshot (like `market_data`), not derived app state. |
| Violations & triggers | Computed on read by the guidelines / trigger services — never stored. Exception: **stateful facts** (add-down consumed, thesis finalized date) are data, not derivations, and live on the thesis row. |
| New skills? | **None.** Screening is deterministic and in-app. Edit `portfolio-review`, `underwrite-name`, `allocation-sync` persistence contracts instead. |

## 3. System overview

```
FMP screener (US, floors)                                 [app: server action]
   → screening_results: quant factor percentiles           [app: quant-score service]
      → Maksim flags names on /screening                   [app: watchlist status machine]
         → Claude skill underwrites flagged names          [skill: research + critique]
            → position_theses DRAFT rows                   [skill writes DB]
               → Maksim reviews/critiques on /research,
                 sets final conviction + promiseRank       [app: finalize action]
                  → target weight via ladder + precedence  [app: policy.ts reconcileActiveTargets]
                     → applyTargetToAllocation (per name)  [app: only weight-writing path]
                        → /construction advisory dashboard [app: guidelines + triggers + governance]
```

Roles: **skills = research + drafts**; **app = storage, quant math, review UI,
advisory dashboards**; **Maksim = final scores and all trades**.

v3 additions the funnel must respect (all advisory, all surfaced, none enforced
by the app): 7-day cooling period between a *new* name's finalized underwriting
and first buy · max 2 admissions/quarter · displacement note required when the
sleeve is full · theses expire at their stated 1–3y horizon.

## 4. Policy as data

`src/shared/policy.ts` (v3) is already live and exports everything the engines
consume: `BUCKET_TARGETS` (core/active), `CASH_TARGET_WEIGHT`,
`OPTIONS_BUDGET_PCT` + `OPTIONS_SPEC`, `SIZING_LADDER`, `NAME_WEIGHT_LIMITS`,
`NAME_COUNTS`, `SECTOR_CAP_PTS_OF_BOOK`, `ADMISSION_RULES`, `ADD_RULES`,
`THESIS_HORIZON_YEARS`, `REBALANCE_BANDS`, `CRASH_DEFINITIONS`/`CRASH_PROTOCOL`,
`ACTIVE_KILL_SWITCH`, `deriveTargetWeight`, `reconcileActiveTargets`.
Never duplicate these numbers in engine code, schema defaults, or docs.

## 5. DB schema deltas (`src/server/db/schema.ts`, all additive, `npm run db:push`)

### 5.1 `allocation_targets.bucket` — DONE (Phase 1)

`text` `"core" | "active"`, nullable (NULL on cash rows and unassigned rows).

### 5.2 `position_theses` — DONE (Phase 2; append-only, holds all versions)

| Column | Notes |
|---|---|
| `id` | PK autoincrement |
| `ticker` | indexed |
| `bucket` | `core \| active` |
| `sector` | text — FMP sector, **overridable at underwriting** to a risk group when theses are correlated (IPS: correlated theses count as one sector) |
| `conviction` | int 1–5 (drives weight via ladder) |
| `promise_rank` | int 1–5 (drives timing only) |
| `keep_decision` | `keep \| cut` |
| `target_weight_pct` | real — ladder value; post-`reconcileActiveTargets` value lives in `allocation_targets` |
| `thesis`, `key_risk`, `catalyst` | text |
| `break_conditions` | JSON text: array of 2–4 **falsifiable statements**; any one verified true ⇒ full exit (Zod-enforced shape) |
| `horizon_months` | int, 12–36 (`THESIS_HORIZON_YEARS`) |
| `expires_at` | set by finalize action = `reviewed_at + horizon_months`; expiry ⇒ re-underwrite or exit |
| `entry_zone_low`, `entry_zone_high`, `entry_note` | entry band + rationale |
| `add_level`, `add_max_size_pct`, `add_note` | the ONE pre-committed add-down |
| `add_down_state` | `available \| used \| void` — set only by UI action (used when executed; void on thesis-relevant bad news). Stateful fact, not derivable |
| `technical_backstop`, `backstop_note` | price that forces a **re-underwrite within 7 days** — never a sale by itself |
| `technical_context` | 50/200-DMA, 52w, analyst target used |
| `status` | `draft \| final \| superseded \| rejected` |
| `version` | per-ticker monotonic; unique `(ticker, version)` |
| `is_current` | boolean; exactly one final current row per ticker |
| `source` | `portfolio_review \| underwrite_name \| manual` |
| `change_reason` | required on every version > 1; a displacement admission's reason must name the displaced incumbent |
| `critique_verdict` | `survives \| overturned \| null` |
| `critique_counter` | strongest counter-argument from the critique pass |
| `created_at`, `reviewed_at` | `reviewed_at` set only by the UI finalize action |

**Removed from the pre-v3 spec:** `trim_level`/`trim_note` (v3 has no valuation
trims — the only trims are the 8% cap and conviction downgrades), `exit_level`
(price never exits; break conditions do), `review_trigger` (subsumed by
`break_conditions`), `stub` (no stub tier).

**Invariants (enforced in actions, asserted in tests):** per ticker, at most one
`draft` and at most one `is_current=1`. Core ETFs carry no levels, no break
conditions, no horizon (policy: no opinions in the Engine).

### 5.3 `screening_runs` (new)

`id, run_date, criteria_json (Zod-validated floors, serialized), universe_count, scored_count, fetched_at`

### 5.4 `screening_results` (new — point-in-time snapshot per run)

`run_id FK, ticker, company_name, sector, industry, exchange, market_cap, price, avg_volume` + raw metric snapshot (`pe_ttm, fwd_pe, pfcf_ttm, ev_ebitda_ttm, ps_ttm, roe_ttm, net_margin_ttm, debt_to_equity_ttm, eps_growth_fwd, price_change_3m, price_change_6m, analyst_upside`) + factor percentiles 0–100 (`value_score, growth_score, quality_score, momentum_score, composite_score`). Unique `(run_id, ticker)`, index `(run_id, composite_score)`.

### 5.5 `watchlist` (new — persists across runs)

`ticker unique, status, source_run_id, note, created_at, updated_at`

Status machine: `candidate → flagged_for_research → researched → watchlisted | rejected`
- UI flag → `flagged_for_research`
- Skill (same tx as draft insert) → `researched`
- UI finalize-with-keep → `watchlisted` (or graduates to `allocation_targets` and row retires)
- UI reject → `rejected`

Cooling-period eligibility is **derived**, not stored: a non-held name's
finalized thesis is buy-eligible from `reviewed_at + ADMISSION_RULES.coolingPeriodDays`;
the UI shows the date. Admissions-per-quarter is derived from first-final-version
dates on non-held names.

## 6. The five engines

### Engine 1 — Guidelines (advisory dashboard) — BUILT, extensions pending

- **`src/server/services/guidelines.ts`** (pure, decimal.js) — live today with:
  bucket rollups (policy vs model vs real, drift, ±5-pt band breach) and
  violations `bucket_drift · cash_band · options_over_budget · name_over_cap ·
  name_below_min · unbucketed · count_breach · model_policy_gap`.
- **Phase 5 extensions:** `sector_cap` (Σ active target weight per
  sector/risk-group > `SECTOR_CAP_PTS_OF_BOOK`) · `options_position_over_cap`
  (single option premium at cost > `OPTIONS_SPEC.maxPremiumPerPositionPct`) ·
  `options_annual_budget` (calendar-year premium bought > budget — from the
  options ledger, expiry/tenor from the OCC symbol) · `admissions_over_cap`
  (>2 first-time finals in a quarter).
- **`/construction` page** (read-only, live): rollup table, violations list,
  triggered-levels/review-demands table (Phase 2 — quiet levels are counted,
  not listed).

### Engine 2 — Screening

- **`fmp.ts` additions** (only file calling FMP):
  - `fetchScreenerCompanies(criteria)` → `/company-screener?marketCapMoreThan&volumeMoreThan&exchange&country=US&isActivelyTrading=true&isEtf=false&limit` — verified live.
  - `fetchPriceChange(ticker)` → `/stock-price-change` (1M/3M/6M/1Y % in one call). **Verify response shape via FMP MCP before wrapping.**
- **`src/server/services/quant-score.ts`** (pure; plain `number` is acceptable — percentile statistics, not money math; document this exception inline):
  - **Valuation**: mean percentile of earnings yield (1/fwdPe, fallback 1/peTtm), FCF yield (1/pfcfTtm), 1/evEbitda, 1/psTtm
  - **Growth**: fwd EPS growth = `fwdEpsAvg/epsTtm − 1` (reuses `fetchForwardEps`), winsorized
  - **Quality**: mean percentile of ROE, net margin, −D/E
  - **Momentum**: mean percentile of 6M and 3M price change; for held/flagged names with history, 50/200-DMA distance via new pure `src/server/services/moving-averages.ts` over `market_data` rows
  - **Composite** = equal-weight mean of *available* factors (renormalize on nulls); winsorize at 1st/99th percentile before ranking.
- **`src/server/actions/screening.ts`**:
  - `runScreen(criteria)` — Zod floors (defaults: mcap ≥ $2B, avg vol ≥ 500k, cap 300 by mcap) → screener → `mapInChunks` fan-out (ratios-ttm, key-metrics-ttm, forward EPS, price-change, price-target) → score → insert run + results in one tx → `revalidatePath('/', 'layout')`. Return `{scored, failed}` in `ActionResult`. Never auto-run on page load.
  - `flagForResearch(ticker)` — upsert watchlist `flagged_for_research` **and** backfill 1y EOD history into `market_data` (existing `fetchStockPrices(ticker, fromDate)`) so DMA/range context exists before underwriting.
  - `setWatchlistStatus(ticker, status)`.
- **Widen `refreshTickerFundamentals`** (`src/server/actions/market-data.ts`): ticker set = transactions stock tickers ∪ watchlist tickers with status ∈ {flagged_for_research, researched, watchlisted}.
- **`/screening` page**: criteria form + Run button, TanStack results table sortable by factor/composite scores, flag toggle per row, watchlist tab (`?tab=` search param).

### Engine 3 — Scoring (theses / drafts / finalize)

- **Zod** `src/shared/schemas/position-thesis.ts`: `bucketSchema`, `thesisDraftSchema`, `finalizeThesisSchema` (conviction/promiseRank ints 1–5, keepDecision keep|cut, `horizonMonths` 12–36, `breakConditions` array 2–4 non-empty strings, edited fields, `changeReason`), `priceLevelsSchema` (nullable levels, `entry_zone_low ≤ entry_zone_high` refinement).
- **Queries** `src/server/queries/theses.ts`: `getDraftQueue()` (drafts joined to prior current-final for field-by-field diff), `getCurrentTheses()`, `getThesisHistory(ticker)`, `getThesisForTicker(ticker)`.
- **Actions** `src/server/actions/theses.ts`:
  - `finalizeThesis(draftId, edits)` — one tx: apply user edits (user owns final conviction/promiseRank), prefill `target_weight_pct` via `deriveTargetWeight` (overridable), set `expires_at`, set `final` + `is_current` + `reviewed_at`, flip prior final to `superseded`, watchlist → `watchlisted`. For a new name entering a full sleeve, require the displacement note in `change_reason`.
  - `rejectDraft(draftId, reason)`.
  - `updatePriceLevels(ticker, levels, changeReason)` — appends a new version cloning current final with new levels.
  - `setAddDownState(ticker, state, reason)` — the only writer of `add_down_state`.
  - `applyTargetToAllocation(ticker)` — **the only automated path that touches allocation weights**: sets `allocation_targets.target_weight` from the thesis (after `reconcileActiveTargets` across all current finals when the ladder sum exceeds the bucket), residual to `app_settings.cash_target_weight`, confirm dialog with exact before/after. Preserves Σ ticker weights + cash weight = 100. Note: cash residual is bookkeeping — the IPS routes real remainders to the Engine; /construction's cash-band violation surfaces the difference.
- **`/research` page**: draft review queue (diff vs prior version, inline edit via the `editable-cell`/`allocation-editor` pattern, critique verdict + counter-argument displayed prominently, Finalize/Reject) + finalized roster (ticker · bucket · conv/rank · horizon · target% · real% · posture).
- **Position detail** (`/positions/[ticker]`): replace `position-notes-placeholder.tsx` with:
  - `PositionThesisPanel` — thesis, numbered break conditions, keyRisk/catalyst, scores, keepDecision, horizon + expiry countdown, add-down state, status badge, collapsible version history, draft-pending banner linking to /research;
  - `PositionLevelsPanel` — reuses `range-bar.tsx` per level vs 52w range, inline-editable numeric levels via `updatePriceLevels`.

### Engine 4 — Triggers & review demands

- **`src/server/services/level-triggers.ts`** (pure): current-final theses + last USD prices + today →
  `{ticker, kind, levelPrice?, lastPrice, distancePct?, dueDate?, triggered}` with kinds:
  - `entry` — last within `[entry_zone_low, entry_zone_high]`; for non-held names, annotate buy-eligible date (cooling period)
  - `add_down` — last ≤ `add_level` AND `add_down_state = available`
  - `backstop_review` — last ≤ `technical_backstop` ⇒ "re-underwrite due within 7 days" (**never rendered as a sell signal**)
  - `expiry_review` — today ≥ `expires_at` ⇒ "thesis expired — re-underwrite or exit"
  - Precedence: a pending `backstop_review` or `expiry_review` **suppresses** `entry`/`add_down` for that name — no buying into an un-reviewed thesis. The 8% hard cap stays in Engine 1 (it's a weight rule, not a price rule).
- Surfaced in: /construction triggered table, position detail panel, dashboard strip (Phase 4).

### Engine 5 — Governance (new in v3)

- **Kill switch:** rolling 24-month active-sleeve TWRR vs `ACTIVE_KILL_SWITCH.benchmark`
  (VT), from the decision-analytics engine + VT history in `market_data`.
  Surfaced on /construction as a status card (window, alpha, pass/fail, next
  annual review date) — advisory; the 10-pt shift is Maksim's manual act per the IPS.
- **Options spec checks** (feeds Engine 1's new violations): per-position premium,
  calendar-year premium spend, tenor-at-open from the options ledger.
- **Annual review pack:** one query/page section assembling the IPS checklist —
  kill-switch result, trims-that-would-have-been (no-trim rule revisit data),
  sector-cap utilization, options budget usage, admissions count.

## 7. Skills DB contract (source of truth for skill edits)

Skills write to `data/portfolio.db` via one-off better-sqlite3 transactions (existing convention). The contract:

**Allowed:**
- INSERT `position_theses` rows with `status='draft'`, `source='portfolio_review'|'underwrite_name'`, `version = COALESCE(MAX(version) per ticker, 0)+1`, `is_current=0`, `add_down_state='available'`, critique fields filled, `change_reason` = one-line delta vs prior record (displacement admissions must name the displaced incumbent).
- UPDATE `watchlist.status`: `flagged_for_research → researched` only, in the same tx as the draft insert.
- `allocation-sync` may still add 0%-weight rows; new rows get `bucket = NULL` and the report says "assign a bucket at /allocation, then run /underwrite-name".

**Prohibited:**
- Never set `status='final'` (the UI finalize action at /research is the single path).
- Never write `allocation_targets.target_weight`, `app_settings.cash_target_weight`, or `add_down_state` beyond the initial `available`.
- Never place or stage trades (existing skill rule, unchanged).

Skill files to edit in Phase 2 (they still encode v1 rubrics — old ladder, stub
tier, band trims, price-level exits): `.claude/skills/portfolio-review/SKILL.md`,
`.claude/skills/underwrite-name/SKILL.md` (both: v3 rubrics — break conditions,
horizons, no trim levels, backstop-not-exit — + persistence contract; watchlist
mode consuming `flagged_for_research` names and their `screening_results`
metrics), `.claude/skills/allocation-sync/SKILL.md` (bucket note).

## 8. The Rebuild — one-time selection from the full universe (no silent overwrite)

The live DB reflects the pre-v3 book: ~18 active names vs the 6–8 target, several
below the 3% minimum, at least one over the 8% cap, cash far above 5%. The sleeve
is **not** pruned from the incumbents — it is rebuilt from the whole universe
under the IPS transition provision (v3.2): **incumbents have zero incumbency
privilege**; a name survives only if it would be bought today from the screen at
full standard. Selling is free (no CGT); the only reason to hold is forward
conviction.

The Rebuild is a milestone that runs **after Phase 3** (it needs both the thesis
pipeline and the screener):

1. /construction already shows every v3 violation — the divergence **is** the
   dashboard's day-one content, not an error state, and it stays visible until
   the Rebuild completes.
2. `runScreen` over the universe → quant ranks → Maksim flags a shortlist of the
   strongest candidates **plus any incumbent worth defending** (incumbents that
   don't make the shortlist are already de-facto cuts, pending their honest
   exit verdict).
3. Every contender — candidate or incumbent — gets the same full-standard
   underwriting (break conditions, horizon, sector, levels) through the draft →
   /research → finalize pipeline. Per the transition provision: no throughput
   cap, no displacement rule, cooling period applies to non-held names only.
4. Select the best 6–8 within the sector cap; finalize → `applyTargetToAllocation`
   per name. Non-selected incumbents are full exits, executed manually in IBKR.
5. Contributions-first rebalancing closes the remaining bucket gaps afterward;
   steady-state admission rules bind from this point on.

## 9. Phases

### Phase 0 — Policy + docs — DONE 2026-08-03 (superseded by IPS v3, 2026-08-04)
### Phase 1 — Buckets + guidelines dashboard — DONE 2026-08-03 (reworked to v2 2026-08-03, v3 2026-08-04; 623 tests green)

### Phase 2 — Theses, drafts, levels — DONE 2026-08-04
- [x] `position_theses` (v3 shape, §5.2) → `db:push`; Zod `position-thesis.ts`; queries + actions (`finalizeThesis`, `rejectDraft`, `updatePriceLevels`, `setAddDownState`, `applyTargetToAllocation` with `reconcileActiveTargets`)
- [x] `/research` page (draft queue + roster)
- [x] Position detail: `PositionThesisPanel` + `PositionLevelsPanel` replace the placeholder
- [x] `level-triggers.ts` (v3 kinds incl. expiry + suppression precedence) + triggered table on /construction
- [x] Skill edits per §7 (v3 rubrics + persistence)
- Verified: 677 Vitest green (+54: schema shape/refinements, action transitions + invariants + displacement gate, add-down state machine, trigger kinds + suppression + nulls + cooling); browser flow via Playwright MCP (seeded draft → /research edit conviction → finalize → `/positions/ASML` panels → Apply dialog exact before/after → /allocation + cash updated, Σ=100 → /construction trigger table) — then reverted; no standing `e2e/` harness exists yet (backlog for Phase 4's full pass). The real portfolio decision waits for the Rebuild (§8, after Phase 3).

### Phase 3 — Screening engine (2–3 days)
- [ ] `screening_runs`, `screening_results`, `watchlist` → `db:push`
- [ ] fmp.ts: `fetchScreenerCompanies`, `fetchPriceChange` (+ types) — verify `/stock-price-change` shape via FMP MCP first
- [ ] `quant-score.ts` + `moving-averages.ts` services
- [ ] `screening.ts` action + queries; widen `refreshTickerFundamentals` to watchlist tickers
- [ ] `/screening` page (criteria form, results table, flag control, watchlist tab with buy-eligible dates); flag → 1y price backfill
- Verify: Vitest (percentile ranking, winsorization, null-factor renormalization, deterministic composite on fixture universe; DMA on synthetic series; fmp wrappers with mocked fetch per existing `fmp.test.ts` pattern; action orchestration with mocked fmp module); Playwright (seeded run: sort by composite, flag a name, watchlist tab — no live FMP in E2E); manual once: real `runScreen` with cap=50.

### Milestone — The Rebuild (after Phase 3; §8)
Screen the universe → shortlist candidates ∪ defensible incumbents → underwrite
all contenders to full standard → select the best 6–8 within the sector cap →
apply targets → exit the rest. One-time transition provision (IPS v3.2) applies.

### Phase 4 — Integration polish (1 day)
- [ ] Dashboard strip ("N triggers · M violations" → /construction)
- [ ] Thesis version-history view; watchlist → allocation graduation flow note
- [ ] Full lint + `test:run` + Playwright pass

### Phase 5 — Governance engine (1–2 days)
- [ ] VT price history into `market_data`; active-sleeve rolling 24-mo TWRR vs VT (decision-analytics extension); kill-switch card on /construction
- [ ] Options spec checks from the options ledger → Engine 1 violations (`options_position_over_cap`, `options_annual_budget`); sector on theses → `sector_cap`; `admissions_over_cap`
- [ ] Annual review pack (checklist data in one place)
- Verify: Vitest (alpha window math on synthetic series, sector-cap aggregation incl. risk-group override, calendar-year premium accounting, tenor parse from OCC symbols); manual: kill-switch card matches decision-analytics numbers.

## 10. Watch items

- `/stock-price-change` still needs shape verification via FMP MCP before coding the wrapper.
- `runScreen` is a long server action — cap the universe, return `{scored, failed}`, never auto-run.
- One-draft/one-current invariant enforced in the actions layer (SQLite partial unique indexes via `db:push` are unreliable); append-only versioning makes concurrent skill + UI writes safe — worst case two drafts, finalize supersedes by version order.
- Do **not** conflate `sleeve-map.ts` (backward-looking analytics taxonomy, 8 sleeves) with the policy buckets.
- `add_down_state` is manual by design (advisory app, trades happen in IBKR) — the ibkr-sync skill may *suggest* flipping it to `used` when it imports a buy below the prior version's add level, but the UI action is the only writer.
- Sector for the cap check comes from FMP's taxonomy, not GICS proper — fine for an advisory cap; the risk-group override on the thesis is the authoritative grouping.
- Kill-switch benchmark is VT (one ticker of history) — backfill enough for a 24-month window plus buffer before the first annual review.

## 11. Phase log

| Date | Phase | Notes |
|---|---|---|
| 2026-08-03 | Design | Document written; design agreed. |
| 2026-08-03 | Phase 0 | `src/shared/policy.ts` + `docs/investment-policy.md` (v1) created; 18 unit tests. |
| 2026-08-03 | Phase 1 | `allocation_targets.bucket` (nullable) pushed; bucket select on /allocation; `guidelines.ts` engine + tests; `/construction` advisory page live. |
| 2026-08-03 | Policy v2 | Strategy reset vs the analytics record: 50/42/3/5, one-tier 8–10 names, ladder 5.5/4.5/3.5, min 3%/cap 8%, options budget, crash protocol. Guidelines reworked to `core\|active`+options+cash; DB buckets migrated (2 core, 18 active). 614 tests. |
| 2026-08-04 | Policy v3 | Ground-up IPS rewrite after outsider review: 57/35/3/5, 6–8 names, sector cap, admission rules (cooling period, 2/quarter, displacement), **no valuation trims**, break-condition exits with backstop-as-review, 1–3y thesis horizons with expiry (v3.1), options spec, mechanical crash protocol, kill switch vs VT, change control. `policy.ts` + tests mirrored; 623 tests green. |
| 2026-08-04 | Doc rewrite | This document rebuilt against v3: stale v1/v2 layers removed, `position_theses` respec'd (break_conditions, horizon/expiry, add_down_state, sector; trim/exit levels dropped), Engine 4 redefined as triggers + review demands with suppression precedence, Engine 5 (governance) and Phase 5 added, reconciliation rewritten for the 18→6–8 prune. |
| 2026-08-04 | Phase 2 | `position_theses` pushed; Zod `position-thesis.ts` (core-no-opinions + keep-requires-horizon/breaks refinements); `queries/theses.ts` + `actions/theses.ts` (finalize/reject/levels/add-down/apply — apply moves the residual into `cash_target_weight`, errors if it would go negative); `level-triggers.ts` + /construction table; `/research` (draft form with diff-vs-prior + critique, roster with Apply confirm); `PositionThesisPanel`/`PositionLevelsPanel` replace the placeholder (placeholder deleted); skills rewritten to v3 + draft-only persistence contract. 677 tests green. Level edits clone a version WITHOUT resetting `reviewed_at`/`expires_at` (cooling + horizon clocks survive level tweaks). |
