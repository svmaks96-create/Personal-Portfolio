import { describe, expect, it } from "vitest";
import { computeVolDrag, dragPctFromVolPct } from "@/server/services/risk/vol-drag";

describe("vol drag", () => {
  it("drag is σ²/2: 35% vol costs ~6.1%/yr, 25% costs ~3.1%", () => {
    expect(dragPctFromVolPct(35)).toBeCloseTo(6.125, 10);
    expect(dragPctFromVolPct(25)).toBeCloseTo(3.125, 10);
    expect(dragPctFromVolPct(0)).toBe(0);
  });

  it("curve is monotonically increasing and covers the current vol range", () => {
    const { curve } = computeVolDrag(32);
    expect(curve[0].volPct).toBe(0);
    expect(curve[curve.length - 1].volPct).toBe(50);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].dragPct).toBeGreaterThan(curve[i - 1].dragPct);
    }
  });

  it("references only include levels below current vol, with correct savings", () => {
    const drag = computeVolDrag(27);
    expect(drag.references.map((r) => r.volPct)).toEqual([25, 20, 15, 10]);
    const at20 = drag.references.find((r) => r.volPct === 20)!;
    expect(at20.savingsPct).toBeCloseTo(
      dragPctFromVolPct(27) - dragPctFromVolPct(20),
      10
    );
  });
});
