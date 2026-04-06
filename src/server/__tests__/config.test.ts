import { describe, it, expect } from "vitest";
import { config } from "../config";

describe("config", () => {
  it("exports fmpApiKey as a string", () => {
    expect(typeof config.fmpApiKey).toBe("string");
  });
});
