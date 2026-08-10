# Feature brief: Portfolio Risk Engineering

**For:** Claude Code, working in my personal portfolio web app repo.
**From:** the app owner (single user — me).
**Status of this document:** intent and rationale, not a spec. You own the architecture. Read the repo and decide the stack, data layer, storage, component structure, and computation methods yourself. Push back on anything below you think is wrong.

---

## Who this is for

I'm a public equities investor. Personal account at Interactive Brokers, roughly $300k, about 16 single-name positions concentrated in AI/semis and software/SaaS — names like TSM, ASML, AVGO, NVDA, CRWV, META, MSFT, ADBE, CRM, MNDY, TEAM, RBRK, FIG, KLAR, BABA, AMZN. Holding period 1–3 years, low turnover. I do my own fundamental research. I'm UAE-based, so there's no capital gains tax and rebalancing costs me nothing but commission.

I'm technically literate but not a mathematician. Everything here has to be interpretable at a glance, not merely correct.

## What I'm trying to solve

I know what I own. I don't know what I'm **exposed to**, and those are different questions.

My working hypothesis is that my 16 positions represent maybe two or three genuinely independent bets, that most of my return over the past two years came from being long the AI capex cycle rather than from picking well within it, and that my portfolio volatility is high enough to be meaningfully eroding my compounding. I don't know if any of that is true. I want the app to tell me.

This module makes no alpha claim and generates no trade ideas. It's measurement and framing. The mechanism by which it grows capital is arithmetic, not insight: geometric return is roughly arithmetic return minus half the variance, so cutting portfolio volatility while holding expected return constant adds compounding directly. At 35% vol the drag is about 6% a year. At 25% it's about 3%. That difference is worth more over a decade than most stock picks.

**One framing point that matters throughout: concentration is not the enemy.** It's a legitimate way to compound, and if my edge really is AI infrastructure then concentrating there is defensible. This module's job is not to nag me toward diversification. It's to make sure concentration is always a decision I've made rather than something I discover in a drawdown.

---

## The five measurements

These are one module sharing one returns matrix and one covariance estimate — not five independent features. Build the shared foundation once.

### 1. Effective bet count

**What.** I hold 16 tickers. I probably don't have 16 bets. If most of my holdings follow one underlying driver, I effectively own a handful of things. This measures how many.

**Why.** Three beliefs of mine depend on it. That adding another AI semi name diversifies me (it may just add a position without adding a bet). That per-ticker position limits constrain anything (if three names are 90% the same bet, 8% each is really one 24% position). And that I can sit through a drawdown — diversification is what makes that possible.

**Must answer.** How many independent bets do I have right now? What *are* they — show me which holdings cluster together and let me name each cluster myself ("AI capex", "software duration", "China"), with labels that persist; don't show me "PC1". How has the number moved over time? What is it during stress windows specifically, since correlations converge toward one in a crash and the number collapses exactly when I need it most? Which individual positions are genuinely diversifying versus redundant? And a simple what-if: if I trimmed X and added Y, what happens?

### 2. Factor decomposition

**What.** Regress my portfolio's returns against things I could have bought instead, as tradeable ETF proxies — SPY, QQQ, SOXX, IGV, and a rates proxy like TLT, since high-multiple software behaves like duration. What's left over after explaining my returns with cheap replicable exposure is the part attributable to my selection.

**Why.** This is the honest read on whether the last two years were skill or was being long the AI capex cycle. If 85% of my variance is two ETFs, that's decision-relevant information about where I should be spending my time.

**Must answer.** What fraction of my returns is explained by exposures I could buy for 10bps? What's the residual, and — critically — **is it statistically distinguishable from zero?** Report the uncertainty honestly. With a couple of years of data and one dominant factor, my expectation is that it won't be significant, and I want the app to say so plainly rather than reporting a flattering point estimate. Where does my beta actually come from, broken out by proxy? Has my factor mix drifted over time without my having decided to change it?

**Trap to handle:** QQQ, SOXX and IGV are highly correlated with each other. A naive multivariate regression will produce unstable and sometimes nonsensical betas. Decide how to deal with it — orthogonalisation, ridge, careful proxy selection, stepwise — and tell me what you chose. I'd prefer tradeable proxies over academic Fama-French factors, because they answer "could I have replicated this cheaply" rather than an academic question, but Fama-French data is free from the Ken French library if you want it as a secondary view.

### 3. Marginal contribution to risk

**What.** For each position: how much portfolio volatility does the *next dollar* add? In a correlated book, adding to a dominant-theme name adds close to its full standalone volatility because it diversifies nothing. A differentiated name adds far less.

**Why.** This is the direct input to sizing. Any sizing rule that ignores correlation will happily recommend piling further into what is already my one bet. Positions whose risk contribution far exceeds their capital weight are quietly running my portfolio whether I intended that or not.

**Must answer.** What percentage of total portfolio risk does each position contribute, shown next to its percentage of capital? Which positions have risk contribution well above weight? If I add $10k to a given name, how much does portfolio volatility move? And as a reference point only, not a recommendation: what would equal-risk-contribution weights look like?

### 4. Historical scenario replay

**What.** Take my *current* weights and run them through actual historical episodes. Not VaR — I want to know what a book like this did in real events, not what a distributional abstraction says.

**Why.** The only question that matters for a 1–3 year holder is whether I can actually sit through the drawdown. A book I've stress-tested in advance is one I'm far more likely to hold. Capitulating at the bottom is the single largest destroyer of long-horizon returns.

**Must answer.** What would my current book have done in: Nov 2021–Oct 2022 multiple compression, Feb–Mar 2020 COVID, Q4 2018, the Aug 2024 yen carry unwind, the Jan 2025 DeepSeek session, April 2025 tariffs? Let me add my own custom windows too. For each: peak-to-trough drawdown, which positions drove the loss, and time to recover.

**Trap to handle:** several of my holdings didn't exist during most of these windows (CRWV, FIG, KLAR listed in 2025; others have short histories). You'll need to either proxy them by factor loadings or exclude them with explicit disclosure. This is a real methodological choice — surface it in the UI, don't bury it.

### 5. Volatility drag and compounding

**What.** The bridge between everything above and the actual goal of growing capital.

**Must answer.** What's my realized portfolio volatility? How much annual compounding is that costing me? If I moved volatility from where it is to some lower level while holding expected return constant, how many basis points of compounding does that add? Show it as a simple curve so I can see where the marginal return to risk reduction flattens out.

**Related:** because I pay no capital gains tax, rebalancing is essentially free for me — a US investor pays 20%+ for the privilege and therefore doesn't do it. So flag drift from target risk contributions. I can act on it in a way most investors can't.

---

## Design principles

- **Interpretability beats sophistication.** A number I understand and act on beats a better number I ignore. If a simpler method gets 90% of the insight with 20% of the explanation burden, take it.
- **Honesty about estimation.** Everything here is a backward-looking estimate from a finite sample. Always show the estimation window, the observation count, and some indication of stability. Never present a single confident number.
- **Reproducibility is non-negotiable.** No LLM anywhere in the calculation path. Same inputs, same outputs, every time. Using an LLM to write prose commentary *about* a computed result is fine if you think it adds something; using one to produce the result is not.
- **Single user, personal app.** Don't build for scale, multi-tenancy, or auth complexity I don't need.

## Shared foundation

All five measurements depend on a returns matrix and a covariance estimate, and that estimate is the shared failure point. Sample covariance on 16 names with a couple of years of daily data is noisy. Shrinkage (Ledoit-Wolf or similar) is probably warranted. Your call, but decide deliberately and tell me what you picked — a bad covariance estimate silently corrupts all five outputs at once.

Other data realities: short histories for the 2025 IPOs; ADR alignment and timezone issues for TSM and BABA; corporate actions must not surface as fake return spikes. Position data can come from an IBKR CSV export or the IBKR connection I have — start with whichever is more reliable.

## Method

Your call throughout. My priors: PCA for bet count, tradeable-proxy regression for factor decomposition, standard risk-contribution decomposition for MCR. But for bet count in particular I'm aware of alternatives — the diversification ratio, Meucci's minimum-torsion effective number of bets, or something as plain as average pairwise correlation.

**Evaluate two or three approaches and tell me which you picked and why rather than silently implementing the first one.** Weight toward stability and explainability. If average pairwise correlation gets me most of the way there and I'll actually understand it, that's a real argument in its favour.

## What "done" looks like

One screen I open weekly. Headline effective bet count, named clusters, factor decomposition with honest error bars, risk contribution table beside capital weights, worst-case scenario replay, and current volatility with its compounding cost. Thirty seconds of looking tells me whether anything has changed.

## Explicitly out of scope

- No trade execution, no order staging, no broker writes.
- No buy/sell/trim recommendations. Measurement and framing only — I make the decisions.
- No return forecasting and no optimiser. Equal-risk-contribution weights appear as a reference point, never as a target.
- No backtesting engine. That may come later as a separate feature; don't build toward it now.
- No P&L attribution or performance reporting. Separate concern.

## Before you start

Read the repo and come back with: what already exists that this should reuse, where this belongs, what you'd build first and in what order, which method you're choosing for each measurement and why, and what you disagree with in this brief.
