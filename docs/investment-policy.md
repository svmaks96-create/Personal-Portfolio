# Investment Policy Statement (IPS)

Owner: Maksim · v3 adopted 2026-08-04 · Supersedes v2 (50/42/3/5, 2026-08-03) and
the v1 bucket policy.

This document is the **source of truth** for portfolio construction policy. The
machine-readable mirror lives in `src/shared/policy.ts`; `src/shared/policy.test.ts`
asserts the two agree on every number. Underwriting rubrics in
`.claude/skills/*/SKILL.md` defer to this document wherever they conflict.

**Changelog**
- v3.4 (2026-10-19, effective 2026-10-26 after the 7-day cooling period):
  options budget made refillable. It is still 3% of book per calendar year, and
  is now measured as open premium at cost + any net realized options loss
  year-to-date, against the current book. Closes return their cost basis.
  Realized results are netted across all option trades. A net profit never
  raises the budget above 3%, and a net loss shrinks it. Rationale: the old
  rule locked the sleeve for the rest of the year after one successful round
  trip, even though the cash at risk had come back. The annual cap on net
  option losses is unchanged. Owner decision. Per-position (≤1%), tenor and
  instrument rules unchanged.
- v3.3 (2026-08-11, effective 2026-08-18 after the 7-day cooling period): risk
  amendments derived from the app's new `/risk` measurement module. Rationale:
  the module showed (a) sleeve market beta drifted 1.02→1.43 across the 2024+
  window with no rule able to see it, (b) the conviction ladder allocates risk
  by accident when standalone vols differ 3× across names (two names held ~12%
  of sleeve capital but ~21% of sleeve risk), (c) the crash protocol is keyed
  entirely to SPY and cannot see a sector-specific unwind (2022 replay: sleeve
  −52% floor; DeepSeek session: sleeve −19% with SPY quiet), and (d) VPU (~10%
  of book, the strongest measured diversifier) existed outside the Part III
  structure entirely. Changes: sleeve risk guardrail + high-vol entry rung-down
  + cluster-based sector-cap evidence (Part IV), marginal-risk contribution
  tie-breaker (Part VI), sleeve-specific unwind review (Part VII), both
  worst-case numbers written down (Part II), VPU formalized inside the
  unchanged 57-pt Engine as a capped structural satellite (target 10, band
  8–12, retention tests; Part III — cap derived from sector-bet discipline,
  not the risk optimum, which would hold more). No bucket target moved; no
  new trim trigger was added.
- v3.2 (2026-08-04): added the one-time transition provision (the initial
  rebuild selects from the full universe; throughput cap and displacement rule
  don't apply to that single event). Owner decision during v3 adoption.
- v3.1 (2026-08-04): clarified that the 10+ year horizon is portfolio-level;
  active theses are underwritten on a 1–3 year horizon and expire (re-underwrite
  or exit). Owner clarification of original v3 intent, not a rule loosening.
- v3 (2026-08-04): ground-up rewrite. Engine floor raised 50→57, active sleeve
  35% / 6–8 names, sector cap and admission rules added, valuation trims removed,
  options sleeve fully specified, crash protocol made mechanical, governance layer
  (kill switch, change control) added, evidence reframed as regime-conditional.
- v2 (2026-08-03): full strategy reset against the 2021–2026 decision-analytics record.

---

## Part I — Principles

These rank the sources of return by reliability and put the burden of proof where
it belongs. Every rule below is derived from them; when a situation is not covered
by a rule, resolve it by these principles in order.

1. **Savings rate and market beta come first.** Contributions (~$75k/yr, ≈20% of
   the book) plus broad-market exposure are the only near-certain compounding
   engine over 10 years. Nothing may put them at risk to fund an opinion.
2. **The second-most-valuable asset is behavior under stress.** The plan's job is
   to make the stressed decision *before* the stress. Any rule that is ambiguous
   under stress will be resolved by mood — so rules that only matter in a crash
   must be mechanical.
3. **The burden of proof is on activity.** Passive is the default state of every
   dollar. Every deviation — a stock, an option, cash held back — carries an
   explicit budget, its own benchmark, and a pre-committed kill switch. Activity
   must keep re-earning its allocation; passivity never has to.
4. **Ambiguity resolves in favor of the Engine.** Any unallocated remainder, any
   rule conflict, any "not sure where this goes" → Passive Core.
5. **Rules fitted to past behavior are hypotheses, not truths.** The 2021–2026
   record (Part VIII) was earned in essentially one market regime. Every fitted
   rule stands only until its scheduled test says otherwise.

## Part II — Objectives and constraints

- **Purpose:** long-term wealth compounding, no planned withdrawals. The **10+
  year horizon is the portfolio's**, not any single idea's: it is how long the
  book compounds before the results are needed. Active theses run on a much
  shorter clock (Part IV).
- **Contributions:** ~$75k+/year. Until the book is several times larger, the
  savings rate is the dominant driver and the true dry powder.
- **Risk posture:** 100% equity. **Expected worst case** (not a cap — no mechanism
  in this policy limits drawdown): roughly −35% peak-to-trough at book level in a
  normal bad market, materially worse in a 2008-class crash. The **active sleeve
  alone** should be expected to draw down **−50% to −60%** in a growth-tech
  unwind (the app's 2022 replay: −52% on 76% coverage — an understated floor,
  since the excluded recent listings are the sleeve's most volatile names).
  Holding the sleeve through such an episode is the plan, provided break
  conditions are intact; these numbers are written here so the stressed decision
  is made now, not at the trough. The written intention is to keep
  buying through it (demonstrated 2021–22: bought $96k in deep drawdowns, sold
  $298). No bonds/gold ballast — the 2021–24 ballast sleeves cost −3.2 pts of
  contribution for zero protection used.
- **Attention budget:** a few hours weekly. The app watches daily; decisions
  happen weekly-to-quarterly. Every rule must be executable on that budget.
- **Taxes:** UAE — no capital-gains tax. Selling is free; the only reason to hold
  is forward conviction. Spreads and churn still cost.
- **Income correlation:** contributions depend on employment income, which is most
  at risk exactly when markets crash. The external emergency buffer (excluded from
  this book) exists for that; no rule in this policy may assume contributions are
  guaranteed, and no crash action is mandatory if income is impaired.

## Part III — Structure (sums to 100%)

| Role | Bucket | Target | Contents |
|---|---|--:|---|
| Engine | Passive Core | **57%** | VTI + VXUS + VPU ≈ 28/19/10. Band-rebalanced. No price levels, no opinions, never traded tactically. This target is a **floor that can only ratchet up** (Part VII). |
| Alpha | Active Stocks | **35%** | 6–8 names, one tier, every name underwritten to the same standard (Part IV). |
| Convexity | Options | **3%** | Annual premium budget (refills on profitable closes), tightly specified (Part V). |
| Liquidity | Cash | **5%** | Operating buffer. Contributions deploy monthly by default — cash is not a market view. |

Total basis = invested holdings + all investable cash (Wio AED savings is
investable; the external emergency buffer is excluded).

**Internal balance.** VTI:VXUS is held at the global market-cap ratio (≈60:40)
— the only opinion-free anchor, making the Engine a two-part VT. VPU sits
inside the Engine as a **capped structural satellite**: target **10 pts of
book, band 8–12**.

**Why 10 (v3.3, derived 2026-08-11).** Measured across every window (ITD incl.
the 2022 bear, 2023+, trailing 24m, 2025+), VPU runs VTI-like volatility with
~0.35 correlation to VTI and **~0.1 to the active sleeve** — the most stable
diversification relationship in the book. The risk data alone would hold
*more*: book vol falls ~0.5pp per 5 pts moved from VTI/VXUS into VPU, with the
minimum-variance point beyond 30% of book. The cap is therefore **not** a risk
result — it is sector-bet discipline: an underwritten active sector earns at
most 14 pts (Part IV); an *ununderwritten* sector opinion in an index wrapper
must sit below that.

**The return side, priced without a forecast (v3.3).** Sample mean returns are
not estimable at useful precision (leadership between VTI/VXUS/VPU flips
window to window while correlations hold; SE of a 5-year mean at 16% vol is
~7pp/yr) — so VPU is sized by **breakeven**, not by expected return: the
variance-drag saving of the 10-pt tilt covers VPU lagging broad equities by up
to **≈1.9%/yr** in price terms (≈3.4%/yr total-return, given VPU's ~1.5pp
dividend advantage). Long-run utilities lag ≈0.5–1%/yr — inside the hurdle.
The 2021–26 sample lag was far outside it — incurred precisely in the AI-bull
regime the rest of the book profits from. **VPU is therefore held as
insurance, not as free diversification**: it is expected to cost a premium
while the AI trade works (~0.1–0.2%/yr on the whole book at 10 pts) and to pay
in the regime where the sleeve and VTI's tech weight fall together. The band
reads: 8 = leaning "AI regime persists", 12 = leaning regime-caution — never
more, since the premium scales with size and the insurance need does not. The
annual review recomputes the breakeven alongside the retention tests below.

**Rules.** VPU never grows beyond its band; transition funding comes from
VTI/VXUS, never VPU; each annual review confirms on `/risk` that (a) its risk
share remains well below its capital weight and (b) its correlation to the
active sleeve remains below **0.4** — sustained breach of either (the
AI-electricity theme fusing it to the AI bet) folds VPU into VTI/VXUS per
Principle 4. Underwriting the electricity thesis properly would move VPU to
the active sleeve under the ladder and sector cap; until that thesis exists
with break conditions, it stays passive and capped.

## Part IV — Active sleeve

### Admission (how a name gets in)

- **Underwriting precedes ownership.** A name may only be bought from the
  watchlist with a completed underwriting on file: falsifiable thesis, 2–4
  numbered **break conditions** (Part IV: Exits), entry zone, one pre-committed
  add-down level with max size, and a technical backstop level.
- **Underwriting horizon: 1–3 years.** Every thesis states when it is expected
  to have played out. A thesis that needs a decade to work is an argument for
  the Engine, not for an active slot. At the stated horizon the thesis
  **expires**: re-underwrite the name from scratch (a fresh thesis on forward
  merit, same standard as a new admission, no cooling period since the position
  exists) or exit. "It'll work eventually" is not a thesis.
- **Cooling period:** at least 7 calendar days between completing an underwriting
  and the first buy. No same-week impulse entries.
- **Throughput cap:** at most 2 new names per quarter.
- **Displacement:** when the sleeve holds 8 names, a new name may enter only by
  displacing the incumbent with the lowest conviction, and the swap must be
  justified in writing (why the new name clears the bar the incumbent doesn't).
- **No incumbency privilege.** Holding a name is not an argument for keeping it.
  At every re-underwriting the question is "would this name be bought today from
  the full universe at full standard?" — selling is free here; only forward
  conviction holds a slot.

### Transition (one-time, expires when first exercised)

The initial migration from the pre-v3 book to the 6–8 name sleeve is a **single
selection event from the full universe**: screen, shortlist the strongest
candidates *and* any incumbent worth defending, underwrite all contenders to the
same standard, and pick the best 6–8 within the sector cap. For this one event
the throughput cap and displacement rule do not apply. The cooling period still
applies to names not currently held (the anti-impulse device loses nothing by
waiting a week). Every non-selected incumbent is a full exit. Afterward, the
steady-state admission rules above bind.

### Sizing

- **Name count:** 6–8. No stub tier — if a name does not deserve ≥3% of the book,
  it does not deserve a slot; the watchlist is where "keeping an eye on it" happens.
- **Ladder (target % of total portfolio, set by conviction):**
  conviction 5 → 5.5% · 4 → 4.5% · 3 → 3.5% · below 3 → no slot (cut or never enter).
- **Precedence:** the 35% bucket target binds over the ladder. If ladder targets
  sum above 35, scale all names down pro-rata (`reconcileActiveTargets` in
  `policy.ts`). If they sum below 35, the remainder sits in the Engine — never
  lower the bar to fill the bucket.
- **Hard cap:** 8% of book per name — mandatory trim back to ladder target above
  it, regardless of view.
- **Minimum:** a held name below 3% real weight is a decision demand: top up to
  target or exit. No lingering remnants.
- **Sector cap:** at most **14 pts of book** (40% of the sleeve) in any one
  sector, counted at target weights. **"One sector" is defined by the app's
  `/risk` correlation clusters** (average pairwise shrunk correlation ≥ 0.5) as
  the default evidence, overriding GICS where they disagree — names whose
  returns say they are one bet count as one sector regardless of
  classification. Judgment may *split* a measured cluster with written
  rationale in the thesis; it may not merge past what the data shows.
- **High-volatility entry rung-down (v3.3):** a name whose standalone
  volatility exceeds **2× SPY's** (per `/risk`, at underwriting) enters **one
  conviction rung below** its ladder weight (5 → 4.5% · 4 → 3.5% · 3 → no
  slot). It graduates to its full rung at a scheduled review once it has
  **12 months** of listed history *and* its risk share no longer exceeds
  **2× its capital weight**. Rationale: at equal conviction, a 90%-vol name is
  a materially larger bet than a 35%-vol name at the same dollar size; the
  ladder must price that.
- **Sleeve risk guardrail (v3.3):** at each quarterly review, record the active
  sleeve's beta to SPY and model volatility from `/risk`. While sleeve beta
  exceeds **1.4** or model vol exceeds **1.75× SPY's** (same window): (a) a new
  name may be admitted only if its `+$10k → Δvol` marginal-risk figure is below
  the sleeve median — high-octane candidates wait, they are not banned; (b)
  contributions routed to the active sleeve obey the same constraint. **No
  existing position is trimmed on this rule** — it gates what comes in, so
  re-levering the sleeve is always a decision, never a drift.
- **Two scores per name:** `conviction` (1–5) = business quality → drives weight
  via the ladder. `promiseRank` (1–5) = entry attractiveness today → drives
  timing only, never weight. Conviction may only be re-scored at a scheduled
  review or a named event (earnings, thesis-relevant news) — not because the
  price moved.

### Trading rules (each is trigger → action, no discretion at execution time)

- **Entries:** build to full ladder target within the underwritten entry zone, in
  at most 2 tranches within 60 days. A position is not a way to start watching a
  stock.
- **Adds are up-only by default.** Adding to winners is the demonstrated edge
  (hypothesis under test, Part VIII). Averaging down is allowed ONLY at the
  add-down level pre-committed at underwriting, ONCE per position, at the
  pre-stated max size — and it is **void** the moment thesis-relevant bad news
  lands. During an active crash protocol the add-down stays valid only if the
  name's drawdown is ≤1.25× SPY's and there is no name-specific adverse news
  (falling with the market ≠ bad news; falling through the market = presumed
  bad news).
- **Trims have exactly two triggers.** (1) The 8% hard cap → mandatory trim to
  ladder target. (2) A conviction downgrade at a scheduled review → resize to the
  new rung. **There are no valuation trims** — the record shows every trim gave
  away +2–4%; positions are held at ladder weight until the cap, a downgrade, or
  an exit. (Regime-conditional; revisited at every annual review.)
- **Exits are full, and fundamental.** An exit fires when **any one numbered
  break condition is verified true** — then the whole position goes, no partial
  de-risking, no "keeping a foot in." The **technical backstop is not an exit
  trigger**: hitting it forces a re-underwrite within 7 days, which must end in a
  written outcome — either "thesis intact → hold" or a full exit. Price alone
  never sells a position; price can force the review that does.
- **A name −40% from cost** is not a crash-protocol event: run its break
  conditions honestly. Intact → hold (adds only per the add rule); broken → full
  exit.

## Part V — Options sleeve (Convexity)

The +7.8 pts historical contribution came from n=7 trades — this sleeve is
budgeted, not extrapolated. Spec:

- **Instruments:** long calls and call debit spreads only. No short premium, no
  puts, no undefined-risk structures.
- **Tenor:** ≥12 months at open.
- **Underlyings:** names currently underwritten in the active sleeve; SPY/VTI
  additionally allowed while a crash protocol is active.
- **Per-position cap:** ≤1% of book in premium at cost.
- **Annual budget:** **3% of current book** per calendar year, at cost, checked
  at each new open:
  *open premium at cost + max(0, −net realized options P&L year-to-date) ≤ 3%
  of book*.
  - Every close, of any option position, returns its cost basis to the budget.
  - Realized results are summed across **all** option trades closed in the
    year. While that total is ≥ 0, the budget stays at the full 3%. Profits
    never raise it above 3%.
  - If the total goes **negative**, the budget shrinks by that net loss. Later
    profits restore it, up to the full 3% again.
  - The total resets on 1 January.

  So at most 3% of book can be lost, net, on options in a calendar year, and a
  profitable round trip doesn't use up the year. Total loss of all open premium
  is an accepted, budgeted cost.
- **Management:** roll/harvest decisions happen at quarterly reviews only.
  Expiring worthless is a budgeted outcome, not a failure requiring response.

## Part VI — Rebalancing

- **Contributions first:** new money goes to the most-underweight bucket monthly;
  at the current savings rate this does most rebalancing for free.
- **No backdoor averaging-down:** contributions routed to the active bucket may
  only buy (a) names at or above cost, (b) a newly admitted name, or (c) a
  still-valid pre-committed add-down. If none applies, the money overflows to the
  Engine — an underweight active sleeve is never, by itself, a buy signal on its
  fallen names.
- **Marginal-risk tie-breaker (v3.3):** when contributions are eligible for
  several active names under the rules above, prefer the name with the lowest
  `+$10k → Δvol` on `/risk`. Correlation-aware sizing for free; never overrides
  eligibility, only orders it.
- **Bands:** rebalance a bucket when >±5 absolute points off target.
- **Cadence:** monthly drift glance · quarterly full review · event-driven per
  name (earnings, hit level, thesis-break headline).

## Part VII — Crash protocol (mechanical; execute, don't re-derive)

**Definitions.** All triggers are measured on **SPY closing price vs its all-time
closing high**. The protocol is *active* from the first close ≤−20% and ends when
SPY closes within 10% of that prior high (**"recovered"**). The portfolio is
reviewed on *thesis*, never sold on *price*.

**While the protocol is active,** the following rules are explicitly suspended or
modified — nothing else changes:
- Contribution routing: 100% of new contributions go to the Engine (overrides
  "most-underweight bucket") until recovered.
- Active add-downs: valid only per the 1.25×-SPY carve-out (Part IV).
- Options underlyings: SPY/VTI become eligible (Part V).

| Trigger (SPY close) | Action |
|---|---|
| −20% | Deploy the cash buffer into the Engine. Re-run the portfolio review on all active names — break-condition check only, no price-driven changes. |
| −30% | Raise the savings rate (cut discretionary spending) if income allows — never from the external emergency buffer. The options sleeve may deploy its remaining annual budget into ≥12-month calls per Part V. |
| −40% | Reread this document and the 2021–22 record (bought through −30.7%, fully recovered). **Selling equity at −40% is prohibited by policy.** |

**After recovery:** the first contributions rebuild cash to its 5% target before
normal routing resumes.

**Sleeve-specific unwind (v3.3).** The triggers above are keyed to SPY and
cannot see a sector-specific crash — the most likely disaster for a
growth-tech-concentrated sleeve (2022 shape: SPY −25%, this sleeve's replay
−52%; DeepSeek session: sleeve −19% with SPY nearly flat). Therefore: **if the
active sleeve closes ≥−35% below its own high while SPY remains above −20%**
(crash protocol not active), run the full break-condition review on all active
names within **7 days**. That is the entire action — no contribution rerouting,
no add-down suspension, nothing sold on price. One trigger, one review;
anything more would multiply the rules needing interpretation mid-panic
(Principle 2).

## Part VIII — Governance

### The active sleeve's kill switch

The 35% active allocation is a **paid hypothesis**: that the post-2025 selection
process produces alpha. It is tested, not trusted:

- **Metric:** rolling 24-month TWRR of the active sleeve vs **VT** (the Engine's
  effective benchmark — what the money would otherwise own), computed by the
  app's decision-analytics engine. SPY is not the benchmark; the sleeve holds
  non-US names and the counterfactual is the Engine, not the S&P.
- **Test, at each annual review:** if rolling 24-month alpha is negative, move
  **10 pts** from Active to Engine (35→25, Engine 57→67). If the *next* annual
  review also fails, the active sleeve is capped at **20%** until two consecutive
  annual reviews pass.
- **Asymmetry is deliberate:** passing the test maintains the sleeve; it never
  grows it. The Engine floor only ratchets up. This is the structural bet that
  compounding is won by not giving back.

### Evidence base — regime disclaimer

The fitted rules (up-only adds, no valuation trims, full exits, options budget)
come from the 2021-02→2026-08 decision-analytics record: core sleeve +36.7 pts of
the 37.7% ITD TWRR; post-2025 active +13.8 pts vs SPY (Sharpe 1.35 on ~18
months); diversifier clutter −12 pts; trimmed names beat SPY +2–4% after every
trim; exited names lagged −8.6% at 180d; averaging down deployed $117k at 10.6%
mean returns vs 38% on single-shot entries; options +7.8 pts on n=7.

That sample is **one regime**: a drawdown-and-recovery followed by a momentum
market, with sample sizes (5 closed episodes, 7 option trades) that cannot
separate skill from regime. In a choppy or prolonged bear market, several of
these lessons plausibly invert. They are therefore encoded as **hypotheses with
scheduled tests** (the kill switch above; the trim rule revisit each annual
review), not as discovered truths. When a rule feels wrong mid-regime, the answer
is the scheduled test — not a mid-cycle rewrite.

### Change control

- Any change to this policy requires a written rationale in the changelog and a
  **7-day cooling period** before taking effect (typo/clarity fixes exempt).
  No policy may be changed while a crash protocol is active, except to make it
  stricter.
- `src/shared/policy.ts` must be updated in the same change; `policy.test.ts`
  pins every number in this document and fails on drift.
- **Annual review checklist:** run the kill-switch test · revisit the no-trim
  rule against the year's data · confirm sector caps still bind sensibly
  (against the `/risk` clusters, per Part IV) · confirm the options budget was
  respected at every open · confirm VPU still diversifies (risk share well below capital
  weight on `/risk`; if not, fold into VTI/VXUS per Part III) · review the
  sleeve risk guardrail readings recorded at the quarterly reviews ·
  re-affirm or amend Part I.

## Part IX — Process ownership

- **Screening/quant scoring:** the app (`/screening`) — deterministic, from FMP data.
- **Underwriting (thesis/break conditions/levels + adversarial critique):**
  Claude Code skills write **draft** thesis records into the app DB.
- **Final scores:** Maksim reviews drafts at `/research`, owns final
  conviction/promiseRank; target weight derives from the ladder + precedence rule.
- **Weights:** the only automated path into `allocation_targets` is the app's
  apply-target action, preserving Σ ticker weights + cash weight = 100.
- **Advisory only:** the app and skills analyze, recommend, and alert; Maksim
  executes every trade manually in IBKR/Wio.
