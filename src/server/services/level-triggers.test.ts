import { describe, it, expect } from "vitest";
import {
  evaluateLevelTriggers,
  type LevelTriggerInput,
} from "./level-triggers";

const TODAY = "2026-08-04";

function input(overrides: Partial<LevelTriggerInput> = {}): LevelTriggerInput {
  return {
    ticker: "ASML",
    bucket: "active",
    isHeld: true,
    entryZoneLow: 600,
    entryZoneHigh: 680,
    addLevel: 550,
    addDownState: "available",
    technicalBackstop: 500,
    expiresAt: "2028-07-01T00:00:00.000Z",
    reviewedAt: "2026-07-01T00:00:00.000Z",
    lastPriceUsd: 650,
    ...overrides,
  };
}

function byKind(rows: ReturnType<typeof evaluateLevelTriggers>, kind: string) {
  return rows.find((r) => r.kind === kind);
}

describe("evaluateLevelTriggers — entry", () => {
  it("triggers when last is inside the zone", () => {
    const rows = evaluateLevelTriggers([input()], TODAY);
    const entry = byKind(rows, "entry");
    expect(entry?.triggered).toBe(true);
    expect(entry?.levelPrice).toBe(680);
  });

  it("does not trigger above the zone and reports distance", () => {
    const rows = evaluateLevelTriggers([input({ lastPriceUsd: 748 })], TODAY);
    const entry = byKind(rows, "entry");
    expect(entry?.triggered).toBe(false);
    expect(entry?.distancePct).toBeCloseTo(10, 5);
  });

  it("does not trigger below the zone low", () => {
    const rows = evaluateLevelTriggers([input({ lastPriceUsd: 590 })], TODAY);
    expect(byKind(rows, "entry")?.triggered).toBe(false);
  });

  it("handles one-sided zones", () => {
    const onlyHigh = evaluateLevelTriggers(
      [input({ entryZoneLow: null, lastPriceUsd: 590 })],
      TODAY,
    );
    expect(byKind(onlyHigh, "entry")?.triggered).toBe(true);

    const onlyLow = evaluateLevelTriggers(
      [input({ entryZoneHigh: null, lastPriceUsd: 590 })],
      TODAY,
    );
    expect(byKind(onlyLow, "entry")?.triggered).toBe(true);
  });

  it("annotates non-held names with the cooling-period eligibility date", () => {
    const rows = evaluateLevelTriggers(
      [input({ isHeld: false, reviewedAt: "2026-08-01T00:00:00.000Z" })],
      TODAY,
    );
    const entry = byKind(rows, "entry");
    // reviewed 08-01 + 7 days → eligible 08-08, still cooling on 08-04
    expect(entry?.dueDate).toBe("2026-08-08");
    expect(entry?.note).toContain("Cooling period");
  });

  it("drops the cooling note once eligible", () => {
    const rows = evaluateLevelTriggers(
      [input({ isHeld: false, reviewedAt: "2026-07-01T00:00:00.000Z" })],
      TODAY,
    );
    const entry = byKind(rows, "entry");
    expect(entry?.dueDate).toBe("2026-07-08");
    expect(entry?.note).toBeNull();
  });
});

describe("evaluateLevelTriggers — add_down", () => {
  it("triggers at/below the add level only while available", () => {
    const at = evaluateLevelTriggers([input({ lastPriceUsd: 550 })], TODAY);
    expect(byKind(at, "add_down")?.triggered).toBe(true);

    const used = evaluateLevelTriggers(
      [input({ lastPriceUsd: 540, addDownState: "used" })],
      TODAY,
    );
    expect(byKind(used, "add_down")).toBeUndefined();

    const voided = evaluateLevelTriggers(
      [input({ lastPriceUsd: 540, addDownState: "void" })],
      TODAY,
    );
    expect(byKind(voided, "add_down")).toBeUndefined();
  });

  it("does not trigger above the level", () => {
    const rows = evaluateLevelTriggers([input({ lastPriceUsd: 560 })], TODAY);
    expect(byKind(rows, "add_down")?.triggered).toBe(false);
  });
});

describe("evaluateLevelTriggers — reviews", () => {
  it("backstop cross demands a review, framed as review not sale", () => {
    const rows = evaluateLevelTriggers([input({ lastPriceUsd: 495 })], TODAY);
    const backstop = byKind(rows, "backstop_review");
    expect(backstop?.triggered).toBe(true);
    expect(backstop?.note).toContain("not a sell signal");
  });

  it("expiry triggers on/after the expiry date", () => {
    const expired = evaluateLevelTriggers(
      [input({ expiresAt: "2026-08-04T00:00:00.000Z" })],
      TODAY,
    );
    const row = byKind(expired, "expiry_review");
    expect(row?.triggered).toBe(true);
    expect(row?.dueDate).toBe("2026-08-04");

    const live = evaluateLevelTriggers(
      [input({ expiresAt: "2026-08-05T00:00:00.000Z" })],
      TODAY,
    );
    expect(byKind(live, "expiry_review")?.triggered).toBe(false);
  });
});

describe("evaluateLevelTriggers — suppression precedence", () => {
  it("a triggered backstop suppresses in-zone entry and add-down", () => {
    // Price 495: below backstop 500, below add 550, inside one-sided zones? 495 < 600 low → not in zone.
    // Use a zone that contains 495 to prove suppression, not zone-miss.
    const rows = evaluateLevelTriggers(
      [input({ entryZoneLow: 450, entryZoneHigh: 680, lastPriceUsd: 495 })],
      TODAY,
    );
    const entry = byKind(rows, "entry");
    const add = byKind(rows, "add_down");
    expect(entry?.triggered).toBe(false);
    expect(entry?.suppressedBy).toBe("backstop_review");
    expect(add?.triggered).toBe(false);
    expect(add?.suppressedBy).toBe("backstop_review");
  });

  it("an expired thesis suppresses buy signals even above the backstop", () => {
    const rows = evaluateLevelTriggers(
      [input({ expiresAt: "2026-01-01T00:00:00.000Z", lastPriceUsd: 650 })],
      TODAY,
    );
    const entry = byKind(rows, "entry");
    expect(entry?.triggered).toBe(false);
    expect(entry?.suppressedBy).toBe("expiry_review");
  });

  it("suppression only marks signals that would have fired", () => {
    const rows = evaluateLevelTriggers(
      [input({ expiresAt: "2026-01-01T00:00:00.000Z", lastPriceUsd: 900 })],
      TODAY,
    );
    const entry = byKind(rows, "entry");
    expect(entry?.triggered).toBe(false);
    expect(entry?.suppressedBy).toBeNull();
  });
});

describe("evaluateLevelTriggers — null handling", () => {
  it("emits nothing for core rows or fully-null levels", () => {
    expect(
      evaluateLevelTriggers([input({ bucket: "core" })], TODAY),
    ).toEqual([]);
    expect(
      evaluateLevelTriggers(
        [
          input({
            entryZoneLow: null,
            entryZoneHigh: null,
            addLevel: null,
            technicalBackstop: null,
            expiresAt: null,
          }),
        ],
        TODAY,
      ),
    ).toEqual([]);
  });

  it("evaluates expiry without a price but skips price-dependent kinds", () => {
    const rows = evaluateLevelTriggers(
      [input({ lastPriceUsd: null, expiresAt: "2026-01-01T00:00:00.000Z" })],
      TODAY,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("expiry_review");
    expect(rows[0].triggered).toBe(true);
  });
});
