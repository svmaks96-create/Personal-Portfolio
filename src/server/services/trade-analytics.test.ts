import {
  computeHoldingPeriodStats,
  computeWinLossStats,
  computeAveragingBehavior,
  computeTurnover,
  computeOutOfMarketEpisodes,
  computeTradeClustering,
} from "./trade-analytics";
import { computeDailyHoldings } from "./daily-holdings";
import { quantile, median, stdevSample, mannWhitneyU, weightedMean } from "./series-utils";
import type { PositionEpisode } from "@/server/types/analytics";
import type { TransactionInput, MarketDataInput } from "@/server/types/positions";

function episode(over: Partial<PositionEpisode>): PositionEpisode {
  return {
    key: "AAA|stock",
    grain: "consolidated",
    ticker: "AAA",
    instrument: "stock",
    portfolios: ["Test"],
    sleeve: null,
    episodeIndex: 1,
    openDate: "2025-01-01",
    closeDate: "2025-02-01",
    asOfDate: "2026-01-01",
    holdingDays: 31,
    isOpen: false,
    trades: [],
    buyCount: 1,
    sellCount: 1,
    addCount: 0,
    trimCount: 0,
    addsAboveAvgCost: 0,
    addsBelowAvgCost: 0,
    addUpUsd: 0,
    addDownUsd: 0,
    maxSharesHeld: 10,
    sharesRemaining: 0,
    totalInvestedUsd: 1000,
    totalProceedsUsd: 1100,
    feesUsd: 0,
    dividendsUsd: 0,
    costBasisRemainingUsd: 0,
    marketValueUsd: 0,
    lastPriceDate: null,
    pricePnlUsd: 100,
    incomePnlUsd: 0,
    totalPnlUsd: 100,
    priceReturnPct: 10,
    totalReturnPct: 10,
    irrPct: null,
    annualizedReturnPct: null,
    outcome: "win",
    dataQuality: {
      missingPrice: false,
      stalePriceDays: null,
      optionCarriedAtCost: false,
      containsTransferLegs: false,
      residualShares: 0,
      dividendsAfterCloseUsd: 0,
    },
    ...over,
  };
}

function win(days: number, pnl = 100, invested = 1000): PositionEpisode {
  return episode({
    holdingDays: days,
    totalPnlUsd: pnl,
    totalInvestedUsd: invested,
    totalReturnPct: (pnl / invested) * 100,
    outcome: "win",
  });
}

function loss(days: number, pnl = -100, invested = 1000): PositionEpisode {
  return episode({
    holdingDays: days,
    totalPnlUsd: pnl,
    totalInvestedUsd: invested,
    totalReturnPct: (pnl / invested) * 100,
    outcome: "loss",
  });
}

describe("series-utils", () => {
  it("computes quantiles with linear interpolation", () => {
    const v = [1, 2, 3, 4];
    expect(median(v)).toBeCloseTo(2.5, 9);
    expect(quantile(v, 0.25)).toBeCloseTo(1.75, 9);
    expect(quantile(v, 0)).toBe(1);
    expect(quantile(v, 1)).toBe(4);
    expect(quantile([], 0.5)).toBeNull();
    expect(median([7])).toBe(7);
  });

  it("computes sample standard deviation", () => {
    expect(stdevSample([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4);
    expect(stdevSample([5, 5, 5])).toBe(0);
    expect(stdevSample([1])).toBeNull();
  });

  it("weights a mean by capital", () => {
    expect(weightedMean([10, 20], [1, 3])).toBeCloseTo(17.5, 9);
    expect(weightedMean([10, 20], [0, 0])).toBeNull();
  });

  it("matches a textbook Mann-Whitney U", () => {
    // Classic worked example: U = 3 for these two samples.
    const r = mannWhitneyU([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
    expect(r.u).toBe(0);
    expect(r.n1).toBe(5);
    expect(r.n2).toBe(5);
    expect(r.pValue).not.toBeNull();
    expect(r.pValue!).toBeLessThan(0.05);

    // Identical distributions should not be separable.
    const same = mannWhitneyU([1, 2, 3, 4], [1, 2, 3, 4]);
    expect(same.pValue!).toBeGreaterThan(0.5);
  });

  it("returns nulls for an empty group", () => {
    const r = mannWhitneyU([], [1, 2, 3]);
    expect(r.pValue).toBeNull();
    expect(r.z).toBeNull();
  });
});

describe("computeHoldingPeriodStats", () => {
  it("measures the disposition gap between winners and losers", () => {
    const episodes = [win(10), win(20), win(30), loss(100), loss(200), loss(300)];
    const stats = computeHoldingPeriodStats(episodes);

    expect(stats.all.n).toBe(6);
    expect(stats.winners.median).toBeCloseTo(20, 9);
    expect(stats.losers.median).toBeCloseTo(200, 9);
    expect(stats.medianGapDays).toBeCloseTo(180, 9);
    expect(stats.test.pValue).not.toBeNull();
  });

  it("reports open-episode ages separately from the closed sample", () => {
    const episodes = [
      win(10),
      loss(20),
      episode({ isOpen: true, closeDate: null, holdingDays: 900, outcome: "win" }),
    ];
    const stats = computeHoldingPeriodStats(episodes);

    // The 900-day open winner must not enter the closed distribution — that
    // exclusion is exactly what biases the gap.
    expect(stats.all.n).toBe(2);
    expect(stats.all.max).toBe(20);
    expect(stats.openEpisodeAges.n).toBe(1);
    expect(stats.openEpisodeAges.median).toBe(900);
  });

  it("returns null gaps when one side is empty", () => {
    const stats = computeHoldingPeriodStats([win(10), win(20)]);
    expect(stats.medianGapDays).toBeNull();
  });
});

describe("computeWinLossStats", () => {
  it("computes rate, expectancy and profit factor", () => {
    const episodes = [win(10, 300), win(10, 100), loss(10, -100), loss(10, -100)];
    const s = computeWinLossStats(episodes);

    expect(s.n).toBe(4);
    expect(s.winRatePct).toBeCloseTo(50, 9);
    expect(s.avgWinPct).toBeCloseTo(20, 9); // (30 + 10) / 2
    expect(s.avgLossPct).toBeCloseTo(-10, 9);
    expect(s.winLossRatio).toBeCloseTo(2, 9);
    expect(s.expectancyPct).toBeCloseTo(5, 9);
    expect(s.profitFactor).toBeCloseTo(2, 9);
    expect(s.expectancyPerEpisodeUsd).toBeCloseTo(50, 9);
  });

  it("excludes flats from the win rate but keeps them in n", () => {
    const episodes = [
      win(10),
      loss(10),
      episode({ outcome: "flat", totalPnlUsd: 0.4, totalReturnPct: 0.04 }),
    ];
    const s = computeWinLossStats(episodes);

    expect(s.n).toBe(3);
    expect(s.flats).toBe(1);
    expect(s.winRatePct).toBeCloseTo(50, 9);
  });

  it("reports a dollar-weighted win rate distinct from the count-based one", () => {
    // One small winner, one large loser: half the episodes won, but only a
    // tenth of the capital did.
    const episodes = [win(10, 50, 1000), loss(10, -900, 9000)];
    const s = computeWinLossStats(episodes);

    expect(s.winRatePct).toBeCloseTo(50, 9);
    expect(s.winRateByDollarsPct).toBeCloseTo(10, 9);
  });

  it("ignores episodes with unknown outcome", () => {
    const s = computeWinLossStats([win(10), episode({ outcome: "unknown", totalPnlUsd: null })]);
    expect(s.n).toBe(1);
  });
});

describe("computeAveragingBehavior", () => {
  it("cohorts episodes by how capital was added and reports each payoff", () => {
    const single = episode({ addCount: 0, outcome: "win", totalPnlUsd: 100, totalReturnPct: 10 });
    const up = episode({
      addCount: 2,
      addsAboveAvgCost: 2,
      addUpUsd: 500,
      outcome: "win",
      totalPnlUsd: 400,
      totalReturnPct: 40,
    });
    const down = episode({
      addCount: 3,
      addsBelowAvgCost: 2,
      addsAboveAvgCost: 1,
      addDownUsd: 800,
      addUpUsd: 200,
      outcome: "loss",
      totalPnlUsd: -300,
      totalReturnPct: -30,
    });

    const stats = computeAveragingBehavior([single, up, down]);

    expect(stats.addsAboveAvgCost).toBe(3);
    expect(stats.addsBelowAvgCost).toBe(2);
    expect(stats.addDownUsd).toBeCloseTo(800, 9);

    const byName = new Map(stats.cohorts.map((c) => [c.cohort, c]));
    expect(byName.get("single-shot")!.n).toBe(1);
    expect(byName.get("only-added-up")!.n).toBe(1);
    expect(byName.get("only-added-up")!.winRatePct).toBe(100);
    expect(byName.get("added-down")!.n).toBe(1);
    expect(byName.get("added-down")!.winRatePct).toBe(0);
    expect(byName.get("added-down")!.meanReturnPct).toBeCloseTo(-30, 9);
  });

  it("classifies an episode with any down-add as added-down", () => {
    const mixed = episode({ addCount: 5, addsAboveAvgCost: 4, addsBelowAvgCost: 1 });
    const stats = computeAveragingBehavior([mixed]);
    expect(stats.cohorts.find((c) => c.cohort === "added-down")!.n).toBe(1);
  });
});

let nextId = 1;
function tx(
  o: Partial<TransactionInput> & Pick<TransactionInput, "action">
): TransactionInput {
  return {
    id: nextId++,
    date: "2025-01-02",
    ticker: "VTI",
    instrument: "stock",
    quantity: 0,
    grossAmount: 0,
    fees: 0,
    portfolio: "Test",
    currency: "USD",
    ...o,
  };
}

describe("computeTurnover", () => {
  beforeEach(() => {
    nextId = 1;
  });

  it("nets transfers by matched notional rather than dropping whole rows", () => {
    // Sells 22.8 shares while 20 are re-bought elsewhere: 20 moved, 2.8 is a
    // real sale. Dropping the whole row would erase the residual.
    const sell = tx({
      action: "sell",
      date: "2025-06-02",
      quantity: 22.8,
      grossAmount: 2280,
      portfolio: "Wio",
    });
    const buy = tx({
      action: "buy",
      date: "2025-06-02",
      quantity: 20,
      grossAmount: 2000,
      portfolio: "Interactive Brokers",
    });

    const points = computeDailyHoldings({
      transactions: [sell, buy],
      priceHistory: { VTI: [{ symbol: "VTI", date: "2025-06-02", value: 100 }] },
      fxHistory: [],
      tradingCalendar: ["2025-06-02"],
      endDate: "2025-06-02",
    });

    const matched = new Map<number, number>([
      [sell.id, 20],
      [buy.id, 20],
    ]);
    const rows = computeTurnover([sell, buy], points, {
      transferMatchedQtyByTxId: matched,
      asOf: "2025-06-02",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].sellsUsd).toBeCloseTo(2280, 6);
    // 2.8 / 22.8 of the notional survives as a real sale.
    expect(rows[0].sellsExTransferUsd).toBeCloseTo(2280 * (2.8 / 22.8), 4);
    expect(rows[0].buysExTransferUsd).toBeCloseTo(0, 6);
    expect(rows[0].transferUsd).toBeCloseTo(2000 + 2280 * (20 / 22.8), 4);
  });

  it("expresses turnover against average AUM, not absolute dollars", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 100, grossAmount: 10000 }),
      tx({ action: "sell", date: "2025-01-03", quantity: 20, grossAmount: 2000 }),
    ];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: [
          { symbol: "VTI", date: "2025-01-02", value: 100 },
          { symbol: "VTI", date: "2025-01-03", value: 100 },
        ],
      },
      fxHistory: [],
      tradingCalendar: ["2025-01-02", "2025-01-03"],
      endDate: "2025-01-03",
    });

    const [row] = computeTurnover(txs, points, { asOf: "2026-01-01" });

    // AUM path 10,000 then 8,000 -> mean 9,000.
    expect(row.avgAumUsd).toBeCloseTo(9000, 6);
    expect(row.turnoverRatio).toBeCloseTo(2000 / 9000, 6);
    expect(row.oneWayTurnover).toBeCloseTo(2000 / 9000, 6);
    expect(row.tradeDays).toBe(2);
    expect(row.isPartialYear).toBe(false);
  });

  it("flags the trailing year as partial", () => {
    const txs = [tx({ action: "buy", date: "2026-01-02", quantity: 10, grossAmount: 1000 })];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { VTI: [{ symbol: "VTI", date: "2026-01-02", value: 100 }] },
      fxHistory: [],
      tradingCalendar: ["2026-01-02"],
      endDate: "2026-01-02",
    });

    expect(computeTurnover(txs, points, { asOf: "2026-08-03" })[0].isPartialYear).toBe(true);
  });
});

describe("computeOutOfMarketEpisodes", () => {
  beforeEach(() => {
    nextId = 1;
  });

  it("finds a liquidation-then-re-entry gap and prices the drag", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 100, grossAmount: 10000 }),
      tx({ action: "sell", date: "2025-01-03", quantity: 100, grossAmount: 10000 }),
      tx({ action: "buy", date: "2025-01-07", quantity: 100, grossAmount: 10000 }),
    ];
    const cal = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: {
        VTI: cal.map((date) => ({ symbol: "VTI", date, value: 100 })),
      },
      fxHistory: [],
      tradingCalendar: cal,
      endDate: "2025-01-07",
    });

    const spy: MarketDataInput[] = [
      { symbol: "SPY", date: "2025-01-03", value: 100 },
      { symbol: "SPY", date: "2025-01-07", value: 106.5 },
    ];

    const gaps = computeOutOfMarketEpisodes(points, {
      minCapitalUsd: 5000,
      benchmarkSeries: spy,
    });

    expect(gaps).toHaveLength(1);
    expect(gaps[0].startDate).toBe("2025-01-03");
    expect(gaps[0].endDate).toBe("2025-01-07");
    expect(gaps[0].capitalOutUsd).toBeCloseTo(10000, 6);
    expect(gaps[0].benchmarkReturnPct).toBeCloseTo(6.5, 6);
    expect(gaps[0].estimatedDragUsd).toBeCloseTo(650, 6);
  });

  it("ignores withdrawals below the threshold", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-02", quantity: 100, grossAmount: 10000 }),
      tx({ action: "sell", date: "2025-01-03", quantity: 1, grossAmount: 100 }),
      tx({ action: "buy", date: "2025-01-07", quantity: 1, grossAmount: 100 }),
    ];
    const cal = ["2025-01-02", "2025-01-03", "2025-01-06", "2025-01-07"];
    const points = computeDailyHoldings({
      transactions: txs,
      priceHistory: { VTI: cal.map((date) => ({ symbol: "VTI", date, value: 100 })) },
      fxHistory: [],
      tradingCalendar: cal,
      endDate: "2025-01-07",
    });

    expect(computeOutOfMarketEpisodes(points, { minCapitalUsd: 5000 })).toEqual([]);
  });
});

describe("computeTradeClustering", () => {
  beforeEach(() => {
    nextId = 1;
  });

  const portfolioSeries = [
    { date: "2025-01-02", growthOfDollar: 1.0 },
    { date: "2025-01-03", growthOfDollar: 1.2 }, // new high
    { date: "2025-01-06", growthOfDollar: 1.02 }, // -15% from peak
    { date: "2025-01-07", growthOfDollar: 1.19 }, // -0.8% from peak
  ];

  it("buckets buy DOLLARS by drawdown state, not trade count", () => {
    const txs = [
      // Three tiny buys at the high.
      tx({ action: "buy", date: "2025-01-07", quantity: 1, grossAmount: 100 }),
      tx({ action: "buy", date: "2025-01-07", quantity: 1, grossAmount: 100 }),
      tx({ action: "buy", date: "2025-01-07", quantity: 1, grossAmount: 100 }),
      // One large buy deep in a drawdown.
      tx({ action: "buy", date: "2025-01-06", quantity: 90, grossAmount: 9000 }),
    ];

    const result = computeTradeClustering(txs, { portfolioSeries });

    const deep = result.byDrawdownState.find((b) =>
      b.label.startsWith("Deep drawdown")
    )!;
    const nearHigh = result.byDrawdownState.find((b) =>
      b.label.startsWith("At or near a high")
    )!;

    expect(deep.tradeCount).toBe(1);
    expect(nearHigh.tradeCount).toBe(3);
    // By dollars the picture inverts — which is the point.
    expect(deep.shareOfBuyDollarsPct).toBeCloseTo((9000 / 9300) * 100, 6);
    expect(nearHigh.shareOfBuyDollarsPct).toBeCloseTo((300 / 9300) * 100, 6);
  });

  it("buckets by benchmark momentum when a series is supplied", () => {
    const benchmark: MarketDataInput[] = Array.from({ length: 25 }, (_, i) => ({
      symbol: "SPY",
      date: new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10),
      // Falls steadily, so the trailing window is negative.
      value: 100 - i,
    }));
    const tradeDate = benchmark[24].date;
    const txs = [tx({ action: "buy", date: tradeDate, quantity: 10, grossAmount: 1000 })];

    const result = computeTradeClustering(txs, {
      portfolioSeries: [{ date: tradeDate, growthOfDollar: 1 }],
      benchmarkSeries: benchmark,
      momentumBars: 20,
    });

    const fellHard = result.byBenchmarkMomentum.find((b) =>
      b.label.includes("fell more than 5%")
    )!;
    expect(fellHard.tradeCount).toBe(1);
    expect(result.coverage.withMomentum).toBe(1);
  });

  it("ranks the biggest trade days and annotates their drawdown state", () => {
    const txs = [
      tx({ action: "buy", date: "2025-01-06", quantity: 90, grossAmount: 9000 }),
      tx({ action: "sell", date: "2025-01-07", quantity: 1, grossAmount: 100 }),
    ];
    const result = computeTradeClustering(txs, { portfolioSeries, topN: 5 });

    expect(result.topTradeDays[0].date).toBe("2025-01-06");
    expect(result.topTradeDays[0].grossUsd).toBeCloseTo(9000, 6);
    expect(result.topTradeDays[0].portfolioDrawdownPct!).toBeLessThan(-10);
  });

  it("summarises activity per year and excludes transfer legs", () => {
    const real = tx({ action: "buy", date: "2025-01-06", quantity: 1, grossAmount: 100 });
    const transfer = tx({ action: "buy", date: "2025-01-06", quantity: 90, grossAmount: 9000 });

    const result = computeTradeClustering([real, transfer], {
      portfolioSeries,
      excludeTxIds: new Set([transfer.id]),
    });

    expect(result.coverage.n).toBe(1);
    expect(result.byYear).toEqual([
      { year: 2025, trades: 1, tradeDays: 1, grossUsd: 100 },
    ]);
  });

  it("reports zero momentum coverage when no benchmark is supplied", () => {
    const txs = [tx({ action: "buy", date: "2025-01-06", quantity: 1, grossAmount: 100 })];
    const result = computeTradeClustering(txs, { portfolioSeries });
    expect(result.coverage.withMomentum).toBe(0);
    expect(result.coverage.withDrawdownState).toBe(1);
  });
});
