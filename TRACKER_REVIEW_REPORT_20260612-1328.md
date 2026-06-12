# Adversarial Review — Personal Portfolio Tracker
**Date:** 2026-06-12 13:28 · **Reviewer stance:** numbers wrong until proven otherwise
**Evidence base:** independent recomputation from raw DB; live IBKR ground truth (positions, trades, balances via MCP); FMP source-data cross-checks; behavioral check of the running app at localhost:3000. Verification scripts are in `tmp-review/` (delete after reading — they are review artifacts, not app code).

---

## 1. Verdict: CONDITIONAL-TRUST

**USE for decisions (verified decision-grade):**
- **Share counts** — every IBKR position matches the broker exactly (17/17 including the GDEVW warrant).
- **Market values of stock positions** (1-day EOD lag by design, "Prices as of Jun 11 close" is labeled).
- **Cost basis, avg entry, unrealized P&L for every open position EXCEPT CRWV** — TSM and clean tickers match IBKR's own avg-cost basis to the cent.
- **Option position marks and option P&L** (ARM:OPT, MNDY:OPT rows) — both marks equal the broker's leg-sums to the cent.
- **Total Value, Cost Basis, Realized/Unrealized P&L KPIs at portfolio level** (CRWV's error only shifts ~$1.1k between the realized and unrealized buckets; their sum is right).
- **Ann. MWRR (money-weighted)** — 20.79% reproduced independently by a different solver at all three scopes.
- **Dividends KPI** — accurate as recorded, but understated by ~$426 (see F5); treat as a floor, not an exact figure.
- **Performance chart for 1M / 1W windows** — clean inputs in those windows.

**DO NOT USE until fixed:**
- **CRWV row: cost basis, unrealized P&L, realized P&L, IRR** (F1 — unrealized has the wrong *sign* on screen; IRR shows a meaningless +17,370%).
- **TWRR for ITD and 3Y periods, and the ITD portion of the value chart** (F2 — ITD cumulative overstated ~8.3pp: 43.7% shown vs ~35.5% corrected; annualized ~7.1% shown vs ~5.9%).
- **Realized P&L attribution for ARM, MRVL, APO closed stock rows** (option P&L mixed in; ticker-level history is mislabeled, totals fine).
- **Allocation page cash rows** (F9 — IBKR cash is $2,636.74 at the broker vs $11,292 entered manually on May 6; ~$8.7k stale).
- **The value chart's "Cost Basis" line in All-Portfolios view** (F4 — built on a different pooling model; $306,076 vs the correct $311,922 on the same screen).
- **1Y TWRR for fine distinctions** — usable directionally, but carries up to ~0.9pp distortion from F1's option-as-stock rows inside the window (+ the F3 mark-lag at the right edge).

---

## 2. The kill shot

The screen currently shows CRWV unrealized P&L as **−$694 when the broker-verified truth is +$409** — a sign flip caused by 14 option trades stored as `instrument='stock'` before the instrument column existed — and the headline ITD performance figure is **~8 points too high** because FMP's split-adjusted price history is applied to as-traded quantities (MJ valued at ~12× reality through 2021–22). Neither error announces itself: every test passes, every page renders, and the same screen shows two different "Cost Basis" numbers $5,846 apart without comment.

---

## 3. Verification log

| # | What was checked | Means | Result |
|---|---|---|---|
| V1 | Share counts, all open positions | **Ground truth** (live IBKR `get_account_positions`) | PASS — 17/17 exact (stocks + GDEVW warrant). EVR/£90 deliberately untracked. Wio has no API: counts verified only internally + via implied-price consistency (V10) |
| V2 | Option marks ARM:OPT 3,842.78 / MNDY:OPT 3,506.61 | **Ground truth** (sum of IBKR option-leg market values) | PASS — both to the cent |
| V3 | Netted option combo rows (gross/fees) | **Ground truth** (raw IBKR executions, DAYS_30) | PASS — ARM 3292/2.86 and 5400/1.44 reproduce exactly from leg-level fills |
| V4 | Cost basis after partial sells (TSM, CRWV-clean) | **Ground truth** (IBKR avg_price × position) | PASS for clean tickers (TSM 6,317.02 exact); CRWV diverges by exactly the option-row pollution → F1 |
| V5 | Every per-position field (shares, basis, invested, dividends, proceeds, MV, realized, unrealized, total P&L), all 3 scopes | **Independent recomputation** (separate implementation, plain-float, `tmp-review/independent.mjs`) | PASS — zero discrepancies vs app output at $0.02 tolerance. The engine computes its stated conventions correctly |
| V6 | Dashboard aggregates + portfolio MWRR | **Independent recomputation** (bisection XIRR vs app's Newton) | PASS — all 3 scopes match to <0.001pp |
| V7 | Per-position IRRs | **Independent recomputation** | PASS except 3 rows where app shows N/A but an IRR exists → F6 |
| V8 | TWRR engine | **Independent recomputation** (own daily-MV walk) | PASS given same inputs (43.722% both) — implementation correct; **inputs** flawed → F1/F2/F3 |
| V9 | TWRR counterfactuals | **Recomputation** (`tmp-review/quantify.mjs`) | ITD 43.72% → 44.58% with option rows reclassified (F1 = −0.86pp); → **35.45%** with MJ prices de-adjusted (F2 = +8.3pp overstatement). Post-2023 sub-periods unaffected by MJ |
| V10 | Implied trade price vs stored market price, all 600+ buy/sell rows | **Invariant sweep** | 31 flags: 14 = options-as-stock (F1), 3 = MJ split-adjustment (F2), rest = illiquid fills (GDEV/GDEVW) and missing pre-listing history (KSPI, DFM/ADX) (F11). **No split-inconsistency in any currently open position.** All Wio fractional trades consistent with market prices |
| V11 | Duplicates (exact row, and market_data symbol/type/date) | Recomputation (SQL) | PASS — none |
| V12 | Sell-exceeds-held replay; orphan dividends | Invariant sweep | PASS — 0 oversells; 6 "orphan" dividends are all legitimate (post-sale ex-date payments, withholding reversals) |
| V13 | Stored price provenance (adjusted vs close) | **Ground-truth comparison** (FMP full EOD: SPY 2021-02-24 close 391.77 = stored) | Stored prices are split-adjusted **close** (no dividend adjustment) → F2 mechanism confirmed; benchmark = price return → F8 |
| V14 | Dividend completeness | **Ground-truth comparison** (FMP dividend calendar × shares held at ex-date) | FAIL — ~$426 gross missing across ≥9 payments since Dec 2025 → F5 |
| V15 | Cash balances vs allocation inputs | **Ground truth** (IBKR balances) | FAIL — $2,636.74 actual vs $11,292 stored → F9 |
| V16 | Displayed UI vs computed values (dashboard KPIs, positions table incl. option rows and totals, 1Y performance legend) | **Behavioral** (Playwright on running app) | PASS — screen equals computation everywhere compared; also exposed F3/F4 as visible same-screen contradictions |
| V17 | App test suite | Behavioral | 379/379 pass (note: tests validate the engine, which is correct — they cannot catch the data-layer findings) |
| V18 | Repo hygiene | Inspection + grep of tracked files | PASS — `.env.local` and `data/portfolio.db` gitignored; `.env.example` has empty key; no key-like strings or account IDs tracked |
| V19 | TWRR vs value-chart vs KPI internal consistency | Behavioral + recomputation | FAIL ×2 — Portfolio Value $333,882 vs Total Value $329,205 (F3); Cost Basis $306,076 vs $311,922 (F4), cause isolated to global-vs-per-portfolio pooling (`tmp-review/basis-mismatch.mjs`) |

---

## 4. Findings

| ID | Sev | Class | Finding & evidence | Decision impact |
|---|---|---|---|---|
| **F1** | **Critical** | WRONG-NUMBER | **14 option trades stored as `instrument='stock'`** (ids 1217, 1219, 1236, 1239, 1248, 1256, 1258, 1260, 1291, 1297, 1341, 1364, 1408, 1409; MRVL/CRWV/APO/ARM, Aug-2025→Apr-2026, predating the instrument column). Quantities are contract counts, gross = net premium (e.g. id 1219: "3 CRWV shares for $2,550" = 3-contract spread @ $8.50). CRWV (open): app basis **6,247.26** vs true stock basis **5,144.18** (= IBKR avg-cost × 58 exactly); screen shows unrealized **−$694**, truth **+$409**; realized overstated **+$1,103.08**; IRR renders **+17,370%** | You'd judge CRWV underwater when it's profitable — direct sizing/exit error on a live position. ARM/MRVL/APO ticker-level realized history unreliable for strategy post-mortems |
| **F2** | **Critical** | WRONG-NUMBER | **Split-adjusted FMP history × as-traded quantities corrupts the performance series.** MJ stored prices are ~12× the as-traded fills (e.g. 2021-05-12: implied 20.185 vs stored 234.84; provenance confirmed: stored SPY = unadjusted close, so the factor is retroactive reverse-split adjustment). Counterfactual: ITD TWRR **43.72% shown vs ~35.45% corrected**; annualized ~7.1% vs ~5.9%. All distortion accrues 2021–22; periods starting ≥2023 are clean | ITD/3Y performance assessment (and the vs-SPY/QQQ comparison ITD) is overstated by ~8pp — you look much closer to the benchmark than you are |
| **F3** | High | WRONG-NUMBER | **Option marks enter the performance/value series one day late and exist only on sync days.** Mark dated 2026-06-12 ≥ calendar's last day 06-11 → charts carry options at cost: Portfolio Value **$333,882** vs Total Value **$329,205** on the same dashboard (Δ = 4,676.51 = exactly the option MTM loss). Between syncs, option P&L lands as single-day cliffs in TWRR | Latest chart point overstates performance ~1.4% today; any TWRR window ending now misses the option drawdown the KPIs already show |
| **F4** | High | WRONG-NUMBER | **Value chart's Cost Basis line pools per ticker globally, the KPI per portfolio** (`twrr.ts` `computeValueVsCostBasisSeries` keys by ticker only; docstring claims it "matches computePositions exactly" — false in All view). Same screen: $306,076 vs $311,922 (−$5,846); per-ticker drift up to −$3,408 (VTI) | The chart's value-vs-basis gap (your "am I up on invested capital" read) is wrong by ~2% whenever a ticker traded in both brokers |
| **F5** | Medium | WRONG-NUMBER (completeness) | **~$426 gross of dividends missing** (FMP calendar × shares at ex-date): VTI 2026-03 $247.25, VPU 2026-03 $96.59, VXUS 2026-03 $41.35, MSFT Feb+May $19.09, TSM Apr $13.03, META Dec+Mar $6.30, BABA Jun-25 $2.10. Root cause: IBKR MCP has no dividend endpoint; Wio dividends only arrive via manual Excel import (last Wio dividend row: Dec 2025) | Dividends KPI, realized P&L and MWRR are floors, not exact; the staleness is systematic and grows every quarter the Excel import isn't run |
| **F6** | Medium | WRONG-NUMBER (mislabeled) | **XIRR Newton solver returns null exactly on deep-loss positions**; UI shows "N/A": GDEV (true −21.1%), GDEVW (−70.7%), ARM:OPT (−99.99%) — bisection solves all three. Portfolio-level IRRs unaffected (verified) | The IRR column goes blank precisely for the worst losers — a survivorship tint on the table you sort by |
| **F7** | Low | WRONG-NUMBER | **All 11 `fee` rows carry the charge in `gross_amount` with `fees=0`**, but `computation.ts:237-241` reads only `fees` → contributes $0 everywhere. Lifetime impact: **$3.46** | Negligible today; the silent-drop pattern means any future fee import in the same shape vanishes without trace |
| **F8** | Medium | COSMETIC→mislabel | **TWRR is price-return, documented as total-return** (`twrr.ts:37-50`): dividend cash is in neither MV nor flows, so it vanishes from the series. Benchmark SPY/QQQ use unadjusted close (verified V13) → the *comparison* is internally consistent (price vs price), but the "cumulative return" headline understates your true total return by your dividend yield, and is methodologically inconsistent with the dividend-inclusive MWRR KPI shown above it | You'll understate your own performance in absolute terms; fine for relative-to-SPY reads |
| **F9** | Medium | WRONG-NUMBER (stale input) | **Allocation cash rows are manual and stale**: 'IBKR Cash USD' = $11,292 (entered 2026-05-06) vs broker $2,636.74 today (−$8,655); Wio balances unverifiable | Allocation drift/rebalancing signals computed against ~3.3% phantom cash |
| **F10** | High | FRAGILE | **No split transaction type exists** (schema: buy/sell/dividend/fee only). A split in any held ticker silently breaks share counts and history — F2/MJ is this failure mode realized. Verified: no *currently open* position spans a split (V1 counts + V10 sweep) | One corporate action away from silent corruption of a live position; nothing would flag it |
| **F11** | Medium | FRAGILE | **Price-history holes carried silently**: KSPI 373 held-trading-days with no quote (pre-Nasdaq listing), GDEVW 363, DFM/ADX names 9–27 each (Sun–Thu calendars vs SPY's Mon–Fri). Series forward-fills/carries at cost; FMP's GDEVW quote (0.011) is 35% above the broker's mark (0.0074) | 2022–23 TWRR shape is partly synthetic; illiquid-name MVs (currently ~$205 GDEVW) lean on stale quotes |
| **F12** | Low | FRAGILE | **Sync duplicate-guard key omits gross_amount** (skill step 3: date/ticker/action/instrument/quantity) — two same-day same-side same-qty executions at different prices dedupe wrongly if not merged first; import-wizard key omits fees | A correct re-sync after a partial sync could silently drop a real trade |
| **F13** | Low | FRAGILE | `fetchPositionInputs` latest-price pick has no tie-break beyond `date DESC`; harmless today (V11: no dup symbol/date rows), nondeterministic if one ever appears | Latent nondeterminism, no current impact |
| **F14** | Low | COSMETIC | Position-detail trade history computes running avg cost *excluding* fees (`position-detail.ts:122-147`) while the position's Avg Entry *includes* them; same page, two conventions | Sub-dollar confusion when auditing a ticker's history |
| **F15** | Low | COSMETIC | "Realized P&L" includes dividends (by WAC convention) while a separate "Dividends" column/KPI is also shown — adding columns double-counts; nothing on screen says so | Mental-math reconciliation errors |

---

## 5. Fix list (decision-impact per effort)

**Required before trusting the affected metrics:**
1. **F1 — Reclassify the 14 option-as-stock rows to `instrument='option'`** (ids above; pure data fix, one UPDATE). Restores CRWV basis/unrealized/realized/IRR and cleans ARM/MRVL/APO attribution. *Minutes of work, fixes a sign error on a live position.*
   **✔ APPLIED 2026-06-12 (post-review, user-approved).** DB backed up to `data/portfolio.backup-20260612-pre-instrument-fix.db`. Post-fix verification: CRWV stock basis **5,144.18** (= IBKR avg-cost × 58 exactly), unrealized **+408.74**, IRR +15.6%; the spreads now appear as closed option positions (CRWV OPT +6,833.35, MRVL OPT +2,272.88, APO OPT +2,051.86) and the April ARM spread's +1,969.89 realized merged into the open ARM OPT row. Dashboard: Total Value and MWRR unchanged (as predicted); Realized 71,391 → 70,288 and Unrealized 17,284 → 18,387 (the $1,103 moved between buckets). The CRWV items in the DO-NOT-USE list above are hereby cleared; the 1Y-TWRR caveat shrinks but the F3 cliff effect remains.
2. **F5/F9 — Run a dividend catch-up import (the ~9 listed payments) and refresh the allocation cash rows.** Both are data entry; consider making the ibkr-sync skill flag expected-but-absent dividends (it already knows positions and dates).
   **✔ F5 APPLIED 2026-06-12 (post-review, user-approved).** 13 rows inserted (+$414.70 net), each at FMP-exact DPS × per-portfolio shares at ex-date, dated by payment date, following the ledger's own conventions (Wio single gross; IBKR US payers gross + −30% withholding pair; TSM single net row at the 21% Jan-2026 precedent; BABA gross, no withholding). Corrections vs the review's estimate: MSFT is $0.91/q (not $0.83), BABA was a $2.00 special belonging to Wio, and NVDA's Dec dividend was never owed (bought after ex-date). DB backed up to `data/portfolio.backup-20260612-pre-dividend-fix.db`. Post-fix: Realized P&L 70,287.86 → 70,702.56 (+414.70 exact), MWRR 20.79% → 20.88%. **Not entered (ex-date passed, cash not yet received):** TSM $0.95509 × 20 net ~$15.09 pays 2026-07-09; BABA $1.05 × 28 = $29.40 pays 2026-07-13; NVDA $0.25 × 39 (raised from $0.01) net ~$6.83 pays 2026-06-26 — enter these on receipt. F9 (allocation cash rows) remains open.
3. **F2 — Decide one convention for history:** either de-adjust stored history for splits (store a split factor per ticker), or add synthetic split transactions to the ledger and keep adjusted prices. Until then, read ITD/3Y TWRR as "~35%, not 43.7%" and treat pre-2023 chart history as decorative.
   **✔ APPLIED 2026-06-12 (post-review, user-approved), via ledger restatement** — the more durable variant, chosen because `refreshPrices`/`backfillHistory` delete-and-reinsert every (symbol, date) row FMP returns, so price-side corrections would not survive a backfill. FMP confirms a single 1-for-12 reverse split effective 2025-02-21 (after the position closed), so MJ quantities were restated to post-split basis: id 97 5→0.416666, id 141 8→0.666667, id 440 13→1.083333 (values chosen to net to exactly zero so the position stays closed). Gross/fees untouched → P&L, dividends, MWRR all unchanged. DB backed up to `data/portfolio.backup-20260612-pre-mj-fix.db`. Post-fix: **ITD TWRR 35.43% cum / 5.90% ann** (was 43.72% / 7.09%), matching the review's counterfactual; dashboard aggregates byte-identical. Note: MJ's closed-row avg entry/exit now display in post-split units (~$218/sh), and the ledger is pinned to the Feb-2025 split basis — a future MJ split + backfill would need restating again (the F10 structural gap stands). The ITD/3Y TWRR items in the DO-NOT-USE list are hereby cleared.
4. **F3 — Date option marks to the last trading day (or include 'today' in the calendar)** so the chart and KPIs agree; longer-term, store marks on every sync day so option P&L stops arriving as cliffs.
5. **F4 — Key the value-walk's basis pools by (ticker, portfolio)** to match the position engine (one-line key change in `computeValueVsCostBasisSeries`), or label the chart's basis as blended.

**Nice to have:**
6. F6 — Fall back to bisection when Newton fails in `computeXIRR` (the bisection in `tmp-review/independent.mjs` solves all three failures).
7. F8 — Rename the performance metric "price return" or add dividend cash to the TWRR MV; align docstring.
8. F10 — Add a `split` action (qty multiplier) so the next corporate action is an entry, not silent corruption.
9. F12 — Add gross_amount to the sync dedupe key.
10. F7 — Make the fee branch read `gross + fees`, or fix the 11 rows ($3.46).
11. F14/F15 — Label conventions (fees-in-basis, dividends-in-realized) where displayed.

---

## 6. What survived (rely on today)

- **The computation engine itself is correct.** An adversarial reimplementation (different arithmetic, different solver) reproduced every position field, every aggregate, and every IRR the app computes, at all three portfolio scopes — to the cent. Every error found lives in the **data layer**, not the math.
- **Share counts and option marks are broker-exact** — the daily "what do I hold and what are my options worth" read is decision-grade.
- **Cost bases match IBKR's own averages to the cent** everywhere the data is clean (i.e., everywhere except CRWV).
- **Portfolio-level Total Value, Total P&L, and MWRR** are trustworthy now (CRWV's error nets out at the total level).
- **Ingestion is conservative where it matters**: no duplicate rows, no oversells, netted option combos reproduce exactly from broker executions, withholding entries faithfully preserved.
- **Repo hygiene is clean**: DB and env gitignored, no credentials or account identifiers in tracked files.

## 7. What could not be verified

- **Wio positions/cash against the broker** — no API; share counts verified only internally (consistent fractional fills at market prices) and IBKR-side. *To close: a Wio statement export for spot-comparison of current units and 2026 dividends.* The review prompt mentions partial IBKR exports — for IBKR the live MCP feed superseded them, but they'd still strengthen the dividend-history check (the MCP exposes no cash transactions); fresh IBKR cash/dividend statements for 2026 would convert F5's estimate into an exact list.
- **Dividend completeness before Dec 2025** — spot-checks of held-vs-paid look consistent (e.g. BND/BNDX monthly runs are dense), but I did not reconcile all 800 dividend rows against per-ETF distribution histories. The ~$426 figure covers ex-dates I checked since Jun 2025.
- **FX machinery** — every transaction row is USD, so `lookupFxRate`/missing-FX paths never execute against real data. They're unit-tested but unproven in production; first non-USD import exercises them blind.
- **Wio's actual cash balances on the allocation page** ($49,094 AED / $441 USD) — manual inputs, no source to check against.
- **Intra-day correctness of the 1-day price lag** — by design the app shows EOD; if you size trades off it intraday, that's a known, labeled approximation.
