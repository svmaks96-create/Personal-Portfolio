import { describe, expect, it } from "vitest";
import {
  replayScenario,
  type ScenarioWindow,
} from "@/server/services/risk/scenario-replay";
import type { MarketDataInput } from "@/server/types/positions";
import type { UniverseWeight } from "@/server/services/risk/weights";

const WINDOW: ScenarioWindow = {
  key: "test",
  label: "Test window",
  from: "2020-01-01",
  to: "2020-01-10",
};

function series(symbol: string, points: [string, number][]): MarketDataInput[] {
  return points.map(([date, value]) => ({ symbol, date, value }));
}

const CALENDAR = [
  "2020-01-01",
  "2020-01-02",
  "2020-01-03",
  "2020-01-06",
  "2020-01-07",
  "2020-01-08",
  "2020-01-09",
  "2020-01-10",
];

function weightsFor(entries: [string, number][]): UniverseWeight[] {
  return entries.map(([ticker, weightPct]) => ({
    ticker,
    weightPct,
    marketValueUsd: weightPct * 1000,
  }));
}

describe("replayScenario", () => {
  it("computes drawdown, recovery and total return for a simple path", () => {
    // One asset: 100 → 80 (trough) → 105. Drawdown −20%, recovers, ends +5%.
    const prices = {
      AAA: series("AAA", [
        ["2020-01-01", 100],
        ["2020-01-02", 95],
        ["2020-01-03", 80],
        ["2020-01-06", 90],
        ["2020-01-07", 100],
        ["2020-01-08", 101],
        ["2020-01-09", 103],
        ["2020-01-10", 105],
      ]),
    };
    const replay = replayScenario(weightsFor([["AAA", 100]]), prices, WINDOW, CALENDAR)!;
    expect(replay.maxDrawdownPct).toBeCloseTo(-20, 8);
    expect(replay.peakDate).toBe("2020-01-01");
    expect(replay.troughDate).toBe("2020-01-03");
    expect(replay.recoveryDays).not.toBeNull();
    expect(replay.totalReturnPct).toBeCloseTo(5, 8);
    expect(replay.coveredWeightPct).toBeCloseTo(100, 8);
  });

  it("weights drift within the window (buy-and-hold, no rebalancing)", () => {
    // AAA halves while BBB doubles; a 50/50 start ends 1/3 vs 2/3 — the
    // portfolio return must be the share-weighted one, not rebalanced daily.
    const flat = (v: number): [string, number][] =>
      CALENDAR.map((d, i) => [d, i === 0 ? v : v * (i === 7 ? 1 : 1)] as [string, number]);
    void flat;
    const prices = {
      AAA: series("AAA", CALENDAR.map((d, i) => [d, 100 - (i * 50) / 7] as [string, number])),
      BBB: series("BBB", CALENDAR.map((d, i) => [d, 100 + (i * 100) / 7] as [string, number])),
    };
    const replay = replayScenario(
      weightsFor([
        ["AAA", 50],
        ["BBB", 50],
      ]),
      prices,
      WINDOW,
      CALENDAR
    )!;
    // Start $1: 0.5 → 0.25 and 0.5 → 1.0 ⇒ end 1.25.
    expect(replay.totalReturnPct).toBeCloseTo(25, 6);
  });

  it("excludes names listed after the window start and renormalizes", () => {
    const prices = {
      OLD: series("OLD", CALENDAR.map((d) => [d, 100] as [string, number])),
      IPO2025: series("IPO2025", [["2025-03-28", 40]]),
    };
    const replay = replayScenario(
      weightsFor([
        ["OLD", 60],
        ["IPO2025", 40],
      ]),
      prices,
      WINDOW,
      CALENDAR
    )!;
    expect(replay.coveredWeightPct).toBeCloseTo(60, 8);
    expect(replay.excluded).toHaveLength(1);
    expect(replay.excluded[0].ticker).toBe("IPO2025");
    expect(replay.excluded[0].reason).toContain("after this window's start");
    expect(replay.totalReturnPct).toBeCloseTo(0, 8);
  });

  it("attributes the drawdown to the positions that drove it", () => {
    // CRASHY −50% peak-to-trough at 50% start weight; STABLE flat.
    const prices = {
      CRASHY: series(
        "CRASHY",
        CALENDAR.map((d, i) => [d, i < 4 ? 100 : 50] as [string, number])
      ),
      STABLE: series("STABLE", CALENDAR.map((d) => [d, 200] as [string, number])),
    };
    const replay = replayScenario(
      weightsFor([
        ["CRASHY", 50],
        ["STABLE", 50],
      ]),
      prices,
      WINDOW,
      CALENDAR
    )!;
    expect(replay.maxDrawdownPct).toBeCloseTo(-25, 6);
    expect(replay.drivers[0].ticker).toBe("CRASHY");
    expect(replay.drivers[0].contributionPct).toBeCloseTo(-25, 6);
    expect(replay.drivers[0].peakToTroughReturnPct).toBeCloseTo(-50, 6);
    const stable = replay.drivers.find((d) => d.ticker === "STABLE")!;
    expect(stable.contributionPct).toBeCloseTo(0, 6);
    // Unrecovered within the window.
    expect(replay.recoveryDays).toBeNull();
  });

  it("returns null when nothing is coverable", () => {
    const replay = replayScenario(
      weightsFor([["GHOST", 100]]),
      {},
      WINDOW,
      CALENDAR
    );
    expect(replay).toBeNull();
  });
});
