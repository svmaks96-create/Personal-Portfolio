# Development Roadmap

> Post-MVP feature roadmap for the Personal Portfolio Tracker.
> Phases are ordered by dependency — each builds on the capabilities introduced before it.

---

## Phase 1: Benchmarking & Performance Tracking

**Goal:** Visualize portfolio performance over time and compare it against market benchmarks.

### Charting Foundation
- Integrate a charting library (Recharts or Tremor) for line charts, bar charts, and area charts
- Establish reusable chart components and a consistent visual language (colors, axes, tooltips)

### Historical Portfolio Value
- Compute daily portfolio value snapshots from the existing `market_data` time-series and transaction ledger
- Line chart on the dashboard showing portfolio value over selectable time ranges (1M, 3M, 6M, YTD, 1Y, All)
- Overlay cost basis line to visualize cumulative invested vs current value

### Time-Weighted Return (TWR)
- Implement TWR calculation in `computation.ts` alongside existing XIRR
- TWR eliminates cash-flow timing bias, making it the standard for benchmark comparison
- Display TWR on the dashboard metrics row and on individual positions

### Benchmark Comparison
- Fetch historical benchmark prices (SPY, QQQ) via FMP and store in `market_data`
- Allow the user to select one or more benchmarks for comparison
- Overlay benchmark return curves on the portfolio performance chart (rebased to same start date)
- Show relative outperformance/underperformance as a separate series or summary metric

### Key Technical Decisions
- **New DB data:** benchmark price history stored in existing `market_data` table with `type: "benchmark"`
- **New service logic:** `computeTWR()` and `computeDailyValues()` in `computation.ts`
- **New components:** `PerformanceChart`, `BenchmarkSelector`, `TimeRangeToggle`

---

## Phase 2: Risk Analytics

**Goal:** Quantify portfolio risk with industry-standard metrics so returns can be evaluated in context.

### Volatility
- Calculate annualized historical volatility (standard deviation of daily/weekly returns)
- Display at portfolio level on the dashboard and per-position on the positions page
- Use the daily portfolio value series from Phase 1 as input

### Maximum Drawdown
- Compute peak-to-trough maximum drawdown over selectable periods
- Visualize drawdown periods on the performance chart (shaded regions or secondary axis)
- Show current drawdown if the portfolio is below its all-time high

### Sharpe Ratio
- Risk-adjusted return: (portfolio return - risk-free rate) / volatility
- Use 3-month US Treasury yield as risk-free rate (fetchable from FMP or hardcoded)
- Display alongside TWR and XIRR on the dashboard

### Presentation
- New "Risk" metric cards on the dashboard (volatility, max drawdown, Sharpe)
- Optional detail panel or tooltip explaining what each metric means for non-finance users
- Risk metrics should gracefully handle insufficient data (< 30 days of history → show "N/A")

### Key Technical Decisions
- **New service logic:** `computeVolatility()`, `computeMaxDrawdown()`, `computeSharpeRatio()` in `computation.ts`
- **Depends on:** daily portfolio value series and TWR from Phase 1

---

## Phase 3: Target Allocation & Rebalancing

**Goal:** Define a target portfolio allocation and track how the actual portfolio drifts from it, with actionable rebalance suggestions.

### Allocation Model Editor
- New page or panel to define target allocations (ticker → target weight %)
- Support grouping by custom categories (e.g., "US Tech", "International", "Fixed Income") — optional enhancement
- Targets must sum to 100%; validation enforces this
- CRUD operations: create, edit, delete allocation targets
- Persist in a new `allocation_targets` DB table

### Actual vs Target Visualization
- Side-by-side or overlaid bar chart comparing current weights (from position data) against targets
- Color-code drift: green (within threshold), amber (drifting), red (significant deviation)
- Table view with columns: ticker, target %, actual %, drift %, drift $

### Drift Detection
- Configurable drift threshold (e.g., alert when any position deviates > 5% from target)
- Visual indicator on the dashboard when portfolio needs rebalancing
- Drift summary: number of positions out of band, total portfolio drift score

### Rebalance Calculator
- Given current positions and target weights, compute the trades needed to rebalance
- Output: list of buy/sell actions with share counts and estimated dollar amounts
- Account for minimum trade sizes and round to whole shares (configurable)
- Option to rebalance by selling overweight positions, buying underweight, or both

### Key Technical Decisions
- **New DB table:** `allocation_targets` (id, ticker, target_weight, group, portfolio, created_at, updated_at)
- **New service logic:** `computeDrift()`, `computeRebalanceTrades()` in a new `rebalancing.ts` service
- **New page:** `/allocation` with editor + visualization + rebalance calculator
- **New components:** `AllocationEditor`, `DriftChart`, `RebalanceTable`

---

## Phase 4: AI Portfolio Assistant

**Goal:** A conversational AI interface powered by Claude that can reason about your portfolio, answer questions, and generate insights.

### Chat Interface
- New `/assistant` page with a chat UI (message list + input box)
- Streaming responses from the Claude API for a responsive feel
- Clean, minimal design consistent with the rest of the app (Shadcn components)

### Portfolio Context Injection
- On each query, inject current portfolio state as context for Claude:
  - Active positions with key metrics (value, weight, P&L, IRR)
  - Aggregate metrics (total value, TWR, Sharpe, max drawdown)
  - Allocation drift data (actual vs target weights)
  - Recent transaction history
- Context is assembled server-side and sent as a system prompt — portfolio data never leaves to a third party beyond the Claude API call

### Core Capabilities
- **Portfolio health check** — "How does my portfolio look?" triggers analysis of concentration risk, sector imbalance, allocation drift, and risk metrics
- **Rebalancing advice** — "How should I rebalance?" provides Claude's reasoning on which trades to prioritize and why, informed by target allocations from Phase 3
- **Q&A** — natural language questions about the portfolio ("What's my biggest winner?", "How much dividend income this year?", "What % is in tech?")
- **Performance review** — "Give me a monthly review" generates a written summary of returns, notable movers, allocation changes, and risk evolution
- **What-if analysis** — "What if I sell half my AAPL?" Claude reasons about the impact on allocation, concentration, and diversification

### Conversation Management
- Session-based conversation history (cleared on page refresh or explicit reset)
- Option to persist conversations to a DB table for future reference (stretch goal)
- Pre-built prompt starters for common queries (health check, review, rebalance advice)

### Key Technical Decisions
- **Claude API integration:** new `src/server/services/claude.ts` service for API calls
- **API key:** `ANTHROPIC_API_KEY` in `.env.local`, accessed via `config.ts`
- **Streaming:** use Claude's streaming API for real-time response rendering
- **Context assembly:** new `src/server/queries/assistant-context.ts` to gather portfolio data for the system prompt
- **New page:** `/assistant` with chat components
- **New components:** `ChatInterface`, `ChatMessage`, `PromptStarters`
- **Model:** Claude Sonnet for speed/cost balance on a personal tool; configurable

---

## Phase 5: Dark Mode

**Goal:** A polished dark theme for comfortable use during evening portfolio checks.

### Implementation
- Enable Tailwind CSS dark mode (class-based strategy)
- Add a theme toggle button in the controls bar (sun/moon icon)
- Persist theme preference in `localStorage`

### Color Token Updates
- Map all hardcoded colors to CSS variables or Tailwind dark: variants
- Key surfaces: zinc-900 background, zinc-800 cards, zinc-700 borders
- Keep semantic colors consistent: emerald for gains, red for losses, amber for warnings
- Charts and visualizations adapt to dark backgrounds

### Scope
- All existing pages and components
- All new components from Phases 1-4
- Skeleton loaders and empty states

### Key Technical Decisions
- **Approach:** Tailwind `darkMode: 'class'` + CSS variables for Shadcn theming
- **Toggle component:** small addition to `ControlsBar`
- **No new dependencies** — Tailwind + Shadcn handle this natively

---

## Dependency Graph

```
Phase 1: Benchmarking & Performance
    ↓
Phase 2: Risk Analytics (needs daily value series from Phase 1)
    ↓
Phase 3: Target Allocation & Rebalancing (independent, but richer with Phase 1-2 data)
    ↓
Phase 4: AI Assistant (most powerful with all prior phases as context)

Phase 5: Dark Mode (independent — can be done at any point)
```

---

## Non-Goals (Explicitly Out of Scope)

These were considered during brainstorming and intentionally excluded:

- Sector/geography allocation breakdown
- Dividend analytics and income tracking
- Tax lot tracking (FIFO/LIFO)
- Mobile-responsive layout
- Multi-source import (CSV, broker-specific)
- Watchlist and price alerts
- Export to PDF/Excel
- Notes/tags on positions
- Goal tracking
- What-if scenario simulator (covered partially by AI assistant)
