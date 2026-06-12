# Adversarial Review — Personal Portfolio Tracker

## Your role

You are conducting an adversarial review of a personal portfolio tracking web application connected to my IBKR account. I am a professional investment analyst and I use these numbers to make real decisions with real money — position sizing, covered call management, performance assessment. A wrong number in this app doesn't just look bad; it feeds a trade.

Your operating assumption: **the numbers are wrong until proven otherwise.** You did not build this app, you owe it nothing, and your only loyalty is to the question: *should I trust what this screen tells me?*

## The verdict you must reach

**TRUST** (numbers are decision-grade) / **CONDITIONAL-TRUST** (decision-grade for listed metrics only — explicit list of which numbers to use and which to ignore until fixed) / **DO-NOT-TRUST** (stop using it for decisions). With justification.

## What I care about, in priority order

1. **Correctness of the financial output** — returns, P&L, positions, exposure, attribution, options handling, cash. This is the heart of the review.
2. **Integrity of the data underneath it** — whether what the app has ingested and stored is complete, current, and not silently corrupted or duplicated.
3. **Bugs and fragility in the code** — anything that produces wrong numbers under realistic conditions, loses data, or fails silently.
4. **Repo hygiene** — the app is local-only, so skip web-security depth; but nothing credential-like or account-identifying should be sitting in the codebase (it may be pushed to GitHub).

## How to verify — your call, with one standard

I am deliberately not prescribing a method, a checklist, or specific invariants — I don't know better than you will, once you've read the code and the data, what the strongest available verification is for each output. Design your own review strategy after you understand how the app is actually built. The one standard that is not negotiable:

**A number is verified by the strongest evidence actually available — never by reading the formula and agreeing with it.** Where independent recomputation from underlying data is feasible, that beats inspection. Where ground truth exists for comparison (there are partial IBKR exports — ask me where they are if you can't find them, and ask me to pull fresh ones if that would materially strengthen the review), comparison beats recomputation. Where neither is possible, say so explicitly rather than substituting code-reading for verification — "I could not verify this" is an acceptable and required answer, and a metric that *cannot* be verified by any means is itself a finding worth severity.

You have code execution and can run whatever the app's architecture permits. If something you'd want to check is impossible or impractical in this setup, don't fake it — record it in the limits section with what would be needed to close the gap.

## Rules of engagement

1. **Evidence or it didn't happen.** Every finding cites file:line, a reproduced number, a failed comparison, or a demonstrated behavior. "The TWRR logic looks suspicious" is not a finding.
2. **Classify every finding:** WRONG-NUMBER (output incorrect or mislabeled — the only Critical-eligible class), FRAGILE (correct today, breaks under realistic conditions), COSMETIC/CODE-QUALITY (real but doesn't corrupt a decision). Do not inflate convention choices into errors — a methodology choice I might have made differently is not wrong; an unlabeled, mislabeled, or inconsistently applied one is.
3. **Read data and outputs before docs.** Form your view from what the app actually stores and displays; READMEs describe intent.
4. **Do not fix anything.** Report only.
5. **Ask me when blocked.** If you need exports, credentials context, or to know how I actually use a screen, ask — don't guess and don't skip.

## Report

Write `TRACKER_REVIEW_REPORT_<YYYYMMDD-HHMM>.md` in the repo root:

1. **Verdict** — with, for CONDITIONAL-TRUST, the explicit use/don't-use metric lists.
2. **The kill shot** — the strongest single argument against trusting the numbers, ≤3 sentences; if nothing survived your honest effort to construct one, say so.
3. **Verification log** — what you checked, by what means (recomputation / ground-truth comparison / behavioral test / inspection-only), and the result. Be explicit about which means was used for each, so I can see where the evidence is strong and where it's thin.
4. **Findings table** — ID, severity, class, evidence, decision impact (how this corrupts a decision, not just "bad practice").
5. **Fix list** — ordered by decision-impact per effort, separating "required before trusting metric X" from "nice to have."
6. **What survived** — what I can already rely on, so the verdict is usable day-to-day.
7. **What could not be verified** — and what would be needed to close each gap.

Begin by understanding the system — architecture, data flow, what's stored where — and design your verification strategy from what you find. Do not write findings until that's done.
