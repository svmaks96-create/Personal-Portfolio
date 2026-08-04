import { describe, it, expect } from "vitest";
import {
  breakConditionsSchema,
  finalizeThesisSchema,
  priceLevelsSchema,
  thesisDraftSchema,
  parseBreakConditions,
} from "./position-thesis";

const validLevels = {
  entryZoneLow: 90,
  entryZoneHigh: 110,
  entryNote: "Accumulate under the 200-DMA",
  addLevel: 80,
  addMaxSizePct: 1.5,
  addNote: "One add, thesis intact only",
  technicalBackstop: 70,
  backstopNote: "Below the 2024 base",
};

const validActiveFinalize = {
  bucket: "active" as const,
  sector: "Technology",
  conviction: 4,
  promiseRank: 3,
  keepDecision: "keep" as const,
  targetWeightPct: null,
  thesis: "Wins share in X",
  keyRisk: "Pricing pressure",
  catalyst: "H2 product cycle",
  breakConditions: ["Loses top customer", "Gross margin below 40% for 2 quarters"],
  horizonMonths: 24,
  levels: validLevels,
  changeReason: null,
};

describe("breakConditionsSchema", () => {
  it("accepts 2–4 non-empty statements", () => {
    expect(breakConditionsSchema.safeParse(["a", "b"]).success).toBe(true);
    expect(breakConditionsSchema.safeParse(["a", "b", "c", "d"]).success).toBe(true);
  });

  it("rejects fewer than 2, more than 4, and empty strings", () => {
    expect(breakConditionsSchema.safeParse(["only one"]).success).toBe(false);
    expect(
      breakConditionsSchema.safeParse(["a", "b", "c", "d", "e"]).success,
    ).toBe(false);
    expect(breakConditionsSchema.safeParse(["a", "  "]).success).toBe(false);
  });
});

describe("priceLevelsSchema", () => {
  it("accepts a full set of levels", () => {
    expect(priceLevelsSchema.safeParse(validLevels).success).toBe(true);
  });

  it("accepts all-null levels (core rows / cleared levels)", () => {
    const nulls = Object.fromEntries(
      Object.keys(validLevels).map((k) => [k, null]),
    );
    expect(priceLevelsSchema.safeParse(nulls).success).toBe(true);
  });

  it("rejects entry zone low above high", () => {
    const result = priceLevelsSchema.safeParse({
      ...validLevels,
      entryZoneLow: 120,
      entryZoneHigh: 100,
    });
    expect(result.success).toBe(false);
  });

  it("allows one-sided entry zones", () => {
    expect(
      priceLevelsSchema.safeParse({
        ...validLevels,
        entryZoneLow: null,
      }).success,
    ).toBe(true);
  });

  it("rejects non-positive prices", () => {
    expect(
      priceLevelsSchema.safeParse({ ...validLevels, addLevel: 0 }).success,
    ).toBe(false);
  });
});

describe("finalizeThesisSchema — active bucket", () => {
  it("accepts a complete active finalize", () => {
    expect(finalizeThesisSchema.safeParse(validActiveFinalize).success).toBe(true);
  });

  it("requires conviction, promiseRank, keepDecision", () => {
    for (const field of ["conviction", "promiseRank", "keepDecision"]) {
      const result = finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        [field]: null,
      });
      expect(result.success).toBe(false);
    }
  });

  it("requires horizon and break conditions on keep decisions", () => {
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        horizonMonths: null,
      }).success,
    ).toBe(false);
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        breakConditions: null,
      }).success,
    ).toBe(false);
  });

  it("allows cut decisions without horizon or break conditions", () => {
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        keepDecision: "cut",
        horizonMonths: null,
        breakConditions: null,
      }).success,
    ).toBe(true);
  });

  it("bounds horizon to 12–36 months and scores to 1–5 ints", () => {
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        horizonMonths: 6,
      }).success,
    ).toBe(false);
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        horizonMonths: 48,
      }).success,
    ).toBe(false);
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        conviction: 6,
      }).success,
    ).toBe(false);
    expect(
      finalizeThesisSchema.safeParse({
        ...validActiveFinalize,
        conviction: 3.5,
      }).success,
    ).toBe(false);
  });
});

describe("finalizeThesisSchema — core bucket", () => {
  it("accepts an opinion-free core row", () => {
    const nullLevels = Object.fromEntries(
      Object.keys(validLevels).map((k) => [k, null]),
    );
    expect(
      finalizeThesisSchema.safeParse({
        bucket: "core",
        sector: null,
        conviction: null,
        promiseRank: null,
        keepDecision: null,
        targetWeightPct: null,
        thesis: "Global market-cap engine",
        keyRisk: null,
        catalyst: null,
        breakConditions: null,
        horizonMonths: null,
        levels: nullLevels,
        changeReason: null,
      }).success,
    ).toBe(true);
  });

  it("rejects core rows carrying scores or break conditions", () => {
    const nullLevels = Object.fromEntries(
      Object.keys(validLevels).map((k) => [k, null]),
    );
    expect(
      finalizeThesisSchema.safeParse({
        bucket: "core",
        sector: null,
        conviction: 5,
        promiseRank: null,
        keepDecision: null,
        targetWeightPct: null,
        thesis: null,
        keyRisk: null,
        catalyst: null,
        breakConditions: null,
        horizonMonths: null,
        levels: nullLevels,
        changeReason: null,
      }).success,
    ).toBe(false);
  });
});

describe("thesisDraftSchema", () => {
  it("uppercases tickers and accepts a skill-shaped draft", () => {
    const result = thesisDraftSchema.safeParse({
      ticker: "asml",
      bucket: "active",
      sector: "Technology",
      conviction: 4,
      promiseRank: 4,
      keepDecision: "keep",
      thesis: "EUV monopoly",
      keyRisk: "China export controls",
      catalyst: "2027 High-NA ramp",
      breakConditions: ["Loses EUV monopoly", "Bookings decline 2 years straight"],
      horizonMonths: 36,
      source: "underwrite_name",
      changeReason: null,
      critiqueVerdict: "survives",
      critiqueCounter: "Cyclical trough could last longer than the horizon",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ticker).toBe("ASML");
    }
  });
});

describe("parseBreakConditions", () => {
  it("parses a JSON array, tolerates null and garbage", () => {
    expect(parseBreakConditions('["a","b"]')).toEqual(["a", "b"]);
    expect(parseBreakConditions(null)).toEqual([]);
    expect(parseBreakConditions("not json")).toEqual([]);
    expect(parseBreakConditions('{"a":1}')).toEqual([]);
  });
});
