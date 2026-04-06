import { describe, it, expect } from "vitest";
import type { ActionResult } from "../action-result";

describe("ActionResult type", () => {
  it("supports success result with data", () => {
    const result: ActionResult<string> = { success: true, data: "ok" };
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("ok");
    }
  });

  it("supports failure result with error", () => {
    const result: ActionResult<string> = { success: false, error: "failed" };
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("failed");
    }
  });

  it("supports void data type", () => {
    const result: ActionResult = { success: true, data: undefined };
    expect(result.success).toBe(true);
  });
});
