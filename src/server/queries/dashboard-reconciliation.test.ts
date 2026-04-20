import { describe, it, expect, vi, beforeEach } from "vitest";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";

// Mock only the DB-hitting input layer. computation.ts runs for real so the
// test exercises the actual aggregation path end-to-end.
vi.mock("@/server/queries/shared-position-inputs", () => ({
  fetchPositionInputs: vi.fn(),
}));

import { getDashboardMetrics } from "./dashboard";
import { fetchPositionInputs } from "@/server/queries/shared-position-inputs";
import { computePositions } from "@/server/services/computation";

const PRICES: Record<string, MarketDataInput> = {
  AAPL: { symbol: "AAPL", date: "2024-12-01", value: 200 },
  MSFT: { symbol: "MSFT", date: "2024-12-01", value: 250 },
  GOOGL: { symbol: "GOOGL", date: "2024-12-01", value: 150 },
};
const FX: FxRateInput[] = [];
const TODAY = "2024-12-01";

// Fixture designed to tickle every "closed/active" combination:
//   AAPL  — closed in Wio (realized +$5k), active in IBKR  ← cross-portfolio ticker
//   MSFT  — fully closed in IBKR (realized +$2k)            ← single-portfolio closure
//   GOOGL — active in Wio                                   ← single-portfolio active
const TXNS: TransactionInput[] = [
  { id: 1, date: "2024-01-01", ticker: "AAPL", action: "buy", quantity: 100, grossAmount: 10000, fees: 0, portfolio: "Wio", currency: "USD" },
  { id: 2, date: "2024-06-01", ticker: "AAPL", action: "sell", quantity: 100, grossAmount: 15000, fees: 0, portfolio: "Wio", currency: "USD" },
  { id: 3, date: "2024-03-01", ticker: "AAPL", action: "buy", quantity: 50, grossAmount: 6000, fees: 0, portfolio: "IBKR", currency: "USD" },
  { id: 4, date: "2024-02-01", ticker: "MSFT", action: "buy", quantity: 100, grossAmount: 20000, fees: 0, portfolio: "IBKR", currency: "USD" },
  { id: 5, date: "2024-08-01", ticker: "MSFT", action: "sell", quantity: 100, grossAmount: 22000, fees: 0, portfolio: "IBKR", currency: "USD" },
  { id: 6, date: "2024-04-01", ticker: "GOOGL", action: "buy", quantity: 100, grossAmount: 14000, fees: 0, portfolio: "Wio", currency: "USD" },
];

beforeEach(() => {
  vi.mocked(fetchPositionInputs).mockImplementation((portfolio?: string) => {
    const txInputs = portfolio ? TXNS.filter((t) => t.portfolio === portfolio) : TXNS;
    const positions = computePositions(txInputs, PRICES, FX, TODAY);
    return {
      txInputs,
      priceMap: PRICES,
      fxRates: FX,
      today: TODAY,
      positions,
      nameMap: {},
    };
  });
});

const sum = (a: number | null, b: number | null): number => (a ?? 0) + (b ?? 0);

describe("getDashboardMetrics reconciliation", () => {
  it("Σ(per-portfolio metrics) equals All metrics across all four fields", () => {
    // Regression: filtering out closed positions before computeAggregates
    // dropped realized P&L from fully-closed positions, so the All view
    // (which keeps merged-active rows whose closed-side contributions sit
    // inside the merge) disagreed with Σ(per-portfolio).
    const all = getDashboardMetrics();
    const wio = getDashboardMetrics("Wio");
    const ibkr = getDashboardMetrics("IBKR");

    expect(sum(wio.totalValue, ibkr.totalValue)).toBeCloseTo(all.totalValue!, 6);
    expect(sum(wio.totalCostBasis, ibkr.totalCostBasis)).toBeCloseTo(all.totalCostBasis!, 6);
    expect(sum(wio.totalRealizedPnl, ibkr.totalRealizedPnl)).toBeCloseTo(all.totalRealizedPnl!, 6);
    expect(sum(wio.totalUnrealizedPnl, ibkr.totalUnrealizedPnl)).toBeCloseTo(all.totalUnrealizedPnl!, 6);
  });

  it("counts realized P&L from tickers closed in one portfolio and active in another", () => {
    const wio = getDashboardMetrics("Wio");
    // AAPL closed in Wio: +$5k realized.  GOOGL active: 0 realized.
    expect(wio.totalRealizedPnl).toBeCloseTo(5000, 6);

    const ibkr = getDashboardMetrics("IBKR");
    // AAPL active in IBKR: 0 realized.  MSFT closed: +$2k realized.
    expect(ibkr.totalRealizedPnl).toBeCloseTo(2000, 6);

    const all = getDashboardMetrics();
    expect(all.totalRealizedPnl).toBeCloseTo(7000, 6);
  });

  it("counts unrealized P&L only from active positions", () => {
    const all = getDashboardMetrics();
    // GOOGL active in Wio: 100 × (150 − 140) = $1k.
    // AAPL active in IBKR: 50 × (200 − 120) = $4k.
    expect(all.totalUnrealizedPnl).toBeCloseTo(5000, 6);
  });
});
