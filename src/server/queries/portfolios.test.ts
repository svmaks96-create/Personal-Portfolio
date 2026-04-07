import { vi, describe, it, expect } from "vitest";

const { mockAll } = vi.hoisted(() => ({
  mockAll: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  db: {
    selectDistinct: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockReturnValue({ all: mockAll }),
      }),
    }),
  },
}));

import { getUniquePortfolios } from "./portfolios";

describe("getUniquePortfolios", () => {
  it("returns empty array when no transactions exist", () => {
    mockAll.mockReturnValue([]);
    expect(getUniquePortfolios()).toEqual([]);
  });

  it("returns sorted portfolio names", () => {
    mockAll.mockReturnValue([
      { portfolio: "Growth" },
      { portfolio: "Main" },
      { portfolio: "Retirement" },
    ]);
    expect(getUniquePortfolios()).toEqual(["Growth", "Main", "Retirement"]);
  });

  it("returns single portfolio", () => {
    mockAll.mockReturnValue([{ portfolio: "Main" }]);
    expect(getUniquePortfolios()).toEqual(["Main"]);
  });
});
