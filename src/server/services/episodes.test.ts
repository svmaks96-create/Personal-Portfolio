import { buildEpisodes } from "./episodes";
import { computePositions } from "./computation";
import type {
  TransactionInput,
  MarketDataInput,
  FxRateInput,
} from "@/server/types/positions";
import type { BuildEpisodesOptions } from "@/server/types/analytics";

let nextId = 1;
function tx(
  overrides: Partial<TransactionInput> & Pick<TransactionInput, "action">
): TransactionInput {
  return {
    id: nextId++,
    date: "2025-01-02",
    ticker: "AAA",
    instrument: "stock",
    quantity: 0,
    grossAmount: 0,
    fees: 0,
    portfolio: "Test",
    currency: "USD",
    ...overrides,
  };
}

beforeEach(() => {
  nextId = 1;
});

const NO_FX: FxRateInput[] = [];

function prices(ticker: string, rows: [string, number][]): Record<string, MarketDataInput[]> {
  return {
    [ticker]: rows.map(([date, value]) => ({ symbol: ticker, date, value })),
  };
}

function opts(over: Partial<BuildEpisodesOptions> = {}): BuildEpisodesOptions {
  return {
    grain: "consolidated",
    endDate: "2026-01-01",
    priceHistory: {},
    fxRates: NO_FX,
    ...over,
  };
}

describe("buildEpisodes — structure", () => {
  it("treats a lone buy as a single open episode", () => {
    const txs = [tx({ action: "buy", quantity: 10, grossAmount: 1000 })];
    const { episodes } = buildEpisodes(
      txs,
      opts({ priceHistory: prices("AAA", [["2025-01-02", 100]]) })
    );

    expect(episodes).toHaveLength(1);
    expect(episodes[0].isOpen).toBe(true);
    expect(episodes[0].closeDate).toBeNull();
    expect(episodes[0].sharesRemaining).toBeCloseTo(10, 9);
    expect(episodes[0].episodeIndex).toBe(1);
  });

  it("closes an episode when a sell takes shares to zero", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-03-03", quantity: 10, grossAmount: 1500 }),
    ];
    const { episodes } = buildEpisodes(txs, opts());

    expect(episodes).toHaveLength(1);
    const ep = episodes[0];
    expect(ep.isOpen).toBe(false);
    expect(ep.closeDate).toBe("2025-03-03");
    expect(ep.holdingDays).toBe(60);
    expect(ep.pricePnlUsd).toBeCloseTo(500, 6);
    expect(ep.totalReturnPct).toBeCloseTo(50, 6);
    expect(ep.outcome).toBe("win");
  });

  it("cuts a re-entry into a second episode with its own index", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-01-10", quantity: 10, grossAmount: 1100 }),
      tx({ action: "sell", date: "2025-02-01", quantity: 20, grossAmount: 2400 }),
      tx({ action: "buy", date: "2025-06-01", quantity: 5, grossAmount: 700 }),
      tx({ action: "sell", date: "2025-07-01", quantity: 5, grossAmount: 600 }),
    ];
    const { episodes } = buildEpisodes(txs, opts());

    expect(episodes).toHaveLength(2);
    expect(episodes.map((e) => e.episodeIndex)).toEqual([1, 2]);
    expect(episodes[0].outcome).toBe("win");
    expect(episodes[0].buyCount).toBe(2);
    expect(episodes[0].addCount).toBe(1);
    expect(episodes[1].outcome).toBe("loss");
    expect(episodes[1].totalInvestedUsd).toBeCloseTo(700, 6);
  });

  it("does NOT close and reopen on a same-day sell-to-zero then re-buy", () => {
    // The BABA 2021-12-31 / 2025-12-10 relocation pattern. Closure is
    // evaluated end-of-day, so this stays one continuous episode.
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 1, grossAmount: 100 }),
      tx({ action: "sell", date: "2025-06-10", quantity: 1, grossAmount: 120 }),
      tx({ action: "buy", date: "2025-06-10", quantity: 2, grossAmount: 240 }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({ priceHistory: prices("AAA", [["2025-06-10", 120]]) })
    );

    expect(episodes).toHaveLength(1);
    expect(episodes[0].isOpen).toBe(true);
    expect(episodes[0].sharesRemaining).toBeCloseTo(2, 9);
  });

  it("closes on float dust but not on a real residual", () => {
    const dust = [
      tx({ action: "buy", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-02-01", quantity: 10 - 1e-13, grossAmount: 1100 }),
    ];
    expect(buildEpisodes(dust, opts()).episodes[0].isOpen).toBe(false);

    nextId = 1;
    const real = [
      tx({ action: "buy", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-02-01", quantity: 9.5, grossAmount: 1045 }),
    ];
    const { episodes } = buildEpisodes(
      real,
      opts({ priceHistory: prices("AAA", [["2025-02-01", 110]]) })
    );
    expect(episodes[0].isOpen).toBe(true);
    expect(episodes[0].sharesRemaining).toBeCloseTo(0.5, 9);
  });
});

describe("buildEpisodes — averaging behaviour", () => {
  it("labels adds relative to running average cost", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-02-02", quantity: 10, grossAmount: 800 }),
      tx({ action: "buy", date: "2025-03-02", quantity: 10, grossAmount: 1500 }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({ priceHistory: prices("AAA", [["2025-03-02", 150]]) })
    );

    const dirs = episodes[0].trades.map((t) => t.addDirection);
    expect(dirs).toEqual(["initial", "down", "up"]);
    expect(episodes[0].addsBelowAvgCost).toBe(1);
    expect(episodes[0].addsAboveAvgCost).toBe(1);
    expect(episodes[0].addDownUsd).toBeCloseTo(800, 6);
    expect(episodes[0].addUpUsd).toBeCloseTo(1500, 6);
  });

  it("treats a buy at exactly the running average cost as flat", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "buy", date: "2025-02-02", quantity: 10, grossAmount: 1000 }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({ priceHistory: prices("AAA", [["2025-02-02", 100]]) })
    );

    expect(episodes[0].trades[1].addDirection).toBe("flat");
    expect(episodes[0].addsAboveAvgCost).toBe(0);
    expect(episodes[0].addsBelowAvgCost).toBe(0);
  });

  it("releases cost basis proportionally on a partial sell", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-02-02", quantity: 4, grossAmount: 600 }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({ priceHistory: prices("AAA", [["2025-02-02", 150]]) })
    );

    // 40% of a $1,000 basis released, leaving $600 against 6 shares.
    expect(episodes[0].costBasisRemainingUsd).toBeCloseTo(600, 6);
    expect(episodes[0].trades[1].runningAvgCostAfter).toBeCloseTo(100, 6);
    expect(episodes[0].trimCount).toBe(1);
  });
});

describe("buildEpisodes — income", () => {
  it("keeps dividends out of price P&L and inside total P&L", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "dividend", date: "2025-04-01", quantity: 0, grossAmount: 30 }),
      tx({ action: "sell", date: "2025-06-01", quantity: 10, grossAmount: 1000 }),
    ];
    const { episodes } = buildEpisodes(txs, opts());

    expect(episodes[0].pricePnlUsd).toBeCloseTo(0, 6);
    expect(episodes[0].incomePnlUsd).toBeCloseTo(30, 6);
    expect(episodes[0].totalPnlUsd).toBeCloseTo(30, 6);
  });

  it("nets withholding rows against the gross dividend", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "dividend", date: "2025-04-01", quantity: 0, grossAmount: 100 }),
      tx({ action: "dividend", date: "2025-04-01", quantity: 0, grossAmount: -30 }),
      tx({ action: "sell", date: "2025-06-01", quantity: 10, grossAmount: 1000 }),
    ];
    expect(buildEpisodes(txs, opts()).episodes[0].dividendsUsd).toBeCloseTo(70, 6);
  });

  it("attaches a trailing dividend to the closed episode and flags the gap", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-02-01", quantity: 10, grossAmount: 1100 }),
      tx({ action: "dividend", date: "2025-02-21", quantity: 0, grossAmount: 5 }),
    ];
    const { episodes, anomalies } = buildEpisodes(txs, opts({ dividendGraceDays: 45 }));

    expect(episodes[0].dividendsUsd).toBeCloseTo(5, 6);
    expect(episodes[0].dataQuality.dividendsAfterCloseUsd).toBeCloseTo(5, 6);
    // 20 days is inside the grace window, so it is recorded but not flagged.
    expect(anomalies.filter((a) => a.kind === "dividend-after-close")).toEqual([]);

    nextId = 1;
    const late = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-02-01", quantity: 10, grossAmount: 1100 }),
      tx({ action: "dividend", date: "2025-09-01", quantity: 0, grossAmount: 5 }),
    ];
    const lateResult = buildEpisodes(late, opts({ dividendGraceDays: 45 }));
    expect(
      lateResult.anomalies.filter((a) => a.kind === "dividend-after-close")
    ).toHaveLength(1);
  });
});

describe("buildEpisodes — options", () => {
  it("carries an open option at cost when the mark predates the last trade", () => {
    const txs = [
      tx({
        action: "buy",
        date: "2026-02-10",
        ticker: "MNDY",
        instrument: "option",
        quantity: 3,
        grossAmount: 3000,
      }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({
        endDate: "2026-08-03",
        optionMarkHistory: {
          MNDY: [{ symbol: "MNDY:OPT", date: "2026-01-01", value: 9999 }],
        },
      })
    );

    expect(episodes[0].marketValueUsd).toBeCloseTo(3000, 6);
    expect(episodes[0].dataQuality.optionCarriedAtCost).toBe(true);
  });

  it("uses a mark that postdates the last option trade", () => {
    const txs = [
      tx({
        action: "buy",
        date: "2026-02-10",
        ticker: "MNDY",
        instrument: "option",
        quantity: 3,
        grossAmount: 3000,
      }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({
        endDate: "2026-08-03",
        optionMarkHistory: {
          MNDY: [{ symbol: "MNDY:OPT", date: "2026-08-03", value: 4200 }],
        },
      })
    );

    expect(episodes[0].marketValueUsd).toBeCloseTo(4200, 6);
    expect(episodes[0].dataQuality.optionCarriedAtCost).toBe(false);
  });

  it("never values an option off the underlying's stock price", () => {
    const txs = [
      tx({
        action: "buy",
        date: "2026-02-10",
        ticker: "ARM",
        instrument: "option",
        quantity: 2,
        grossAmount: 2000,
      }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({
        endDate: "2026-08-03",
        priceHistory: prices("ARM", [["2026-08-03", 150]]),
      })
    );

    expect(episodes[0].marketValueUsd).toBeCloseTo(2000, 6);
  });

  it("keeps stock and option episodes on one underlying separate", () => {
    const txs = [
      tx({ action: "buy", date: "2026-01-05", ticker: "ARM", quantity: 10, grossAmount: 1000 }),
      tx({
        action: "buy",
        date: "2026-02-10",
        ticker: "ARM",
        instrument: "option",
        quantity: 2,
        grossAmount: 2000,
      }),
    ];
    const { episodes } = buildEpisodes(
      txs,
      opts({ endDate: "2026-08-03", priceHistory: prices("ARM", [["2026-08-03", 150]]) })
    );

    expect(episodes).toHaveLength(2);
    expect(episodes.map((e) => e.instrument).sort()).toEqual(["option", "stock"]);
  });
});

describe("buildEpisodes — grain and anomalies", () => {
  it("merges portfolios at consolidated grain and splits them at account grain", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", portfolio: "Wio", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-12-10", portfolio: "Wio", quantity: 10, grossAmount: 1500 }),
      tx({
        action: "buy",
        date: "2025-12-10",
        portfolio: "Interactive Brokers",
        quantity: 10,
        grossAmount: 1500,
      }),
    ];
    const priceHistory = prices("AAA", [["2026-01-01", 160]]);

    const consolidated = buildEpisodes(txs, opts({ grain: "consolidated", priceHistory }));
    expect(consolidated.episodes).toHaveLength(1);
    expect(consolidated.episodes[0].isOpen).toBe(true);
    expect(consolidated.episodes[0].portfolios).toEqual([
      "Interactive Brokers",
      "Wio",
    ]);

    const account = buildEpisodes(txs, opts({ grain: "account", priceHistory }));
    expect(account.episodes).toHaveLength(2);
    expect(account.episodes.filter((e) => e.isOpen)).toHaveLength(1);
  });

  it("records an orphan sell as an anomaly instead of throwing", () => {
    const txs = [tx({ action: "sell", quantity: 5, grossAmount: 500 })];
    const { episodes, anomalies } = buildEpisodes(txs, opts());

    expect(episodes).toEqual([]);
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0].kind).toBe("orphan-sell");
  });

  it("suppresses annualized return on very short episodes", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000 }),
      tx({ action: "sell", date: "2025-01-10", quantity: 10, grossAmount: 950 }),
    ];
    const ep = buildEpisodes(txs, opts()).episodes[0];

    expect(ep.holdingDays).toBe(8);
    expect(ep.annualizedReturnPct).toBeNull();
    expect(ep.totalReturnPct).toBeCloseTo(-5, 6);
  });

  it("marks a position with no price at all as unknown rather than zero", () => {
    const txs = [tx({ action: "buy", quantity: 10, grossAmount: 1000 })];
    const ep = buildEpisodes(txs, opts({ priceHistory: {} })).episodes[0];

    // seedSyntheticPricesFromFirstBuy backfills cost at the first buy, so this
    // is valued at cost rather than dropped — and never silently zero.
    expect(ep.marketValueUsd).toBeCloseTo(1000, 6);
    expect(ep.dataQuality.missingPrice).toBe(false);
  });
});

describe("buildEpisodes — reconciliation against computePositions", () => {
  it("sums episode total P&L to the position's totalPnl", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000, fees: 2 }),
      tx({ action: "buy", date: "2025-02-02", quantity: 10, grossAmount: 900, fees: 1 }),
      tx({ action: "dividend", date: "2025-03-01", quantity: 0, grossAmount: 40 }),
      tx({ action: "sell", date: "2025-04-01", quantity: 20, grossAmount: 2200, fees: 3 }),
      tx({ action: "buy", date: "2025-08-01", quantity: 5, grossAmount: 600, fees: 1 }),
      tx({ action: "dividend", date: "2025-09-01", quantity: 0, grossAmount: 10 }),
      tx({ action: "sell", date: "2025-10-01", quantity: 2, grossAmount: 260, fees: 1 }),
    ];
    const asOf = "2026-01-01";
    const priceHistory = prices("AAA", [["2026-01-01", 140]]);

    const { episodes } = buildEpisodes(
      txs,
      opts({ grain: "account", endDate: asOf, priceHistory })
    );
    const [position] = computePositions(
      txs,
      { AAA: { symbol: "AAA", date: asOf, value: 140 } },
      NO_FX,
      asOf
    );

    expect(episodes).toHaveLength(2);
    const summed = episodes.reduce((a, e) => a + (e.totalPnlUsd ?? 0), 0);
    expect(summed).toBeCloseTo(position.totalPnl ?? 0, 2);
  });

  it("reconciles a fully-closed position too", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 10, grossAmount: 1000, fees: 2 }),
      tx({ action: "dividend", date: "2025-03-01", quantity: 0, grossAmount: 25 }),
      tx({ action: "sell", date: "2025-06-01", quantity: 10, grossAmount: 1300, fees: 2 }),
    ];
    const asOf = "2026-01-01";

    const { episodes } = buildEpisodes(txs, opts({ grain: "account", endDate: asOf }));
    const [position] = computePositions(txs, {}, NO_FX, asOf);

    expect(episodes[0].totalPnlUsd).toBeCloseTo(position.totalPnl ?? 0, 2);
    expect(position.isClosed).toBe(true);
  });
});
