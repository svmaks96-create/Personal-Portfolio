import { describe, expect, it } from "vitest";
import {
  hasStructure,
  parseCounterPoints,
  parseThesisSections,
  splitContextSegments,
  splitNoteSegments,
  stripInlineMarkdown,
} from "./thesis-format";

const STRUCTURED_THESIS = [
  "**Claim:** The market prices Creative Cloud as terminal decline; the bet is deceleration-not-decline.",
  "",
  "**Evidence:**",
  "1. Valuation at decade lows: fwd P/E ~10.9x on FY26 EPS ~$24.40.",
  "2. Organic cc ARR growth ~10.4% (Q2 FY26), guided to ~8%.",
  "3. Inorganic separated: Semrush contributes ~$40M/qtr.",
  "",
  "**What must be true:** organic cc ARR >=8% y/y through FY27 · margins hold near the ~45% guide · pricing power resumes (no second deferral).",
  "",
  "**Conviction worksheet:**",
  "| pillar | score | anchoring fact |",
  "|---|---|---|",
  "| moat/quality | 4 | 36% ROIC franchise |",
  "| growth durability | 2 | organic ~10.4% -> guided ~8% |",
  "Mean 3.75 -> structural cap 3. **Conviction 3.**",
  "",
  "**Exit paths (IPS v3 — no price-target exits by design):** (1) any break condition verified true -> full exit; (2) conviction <3 at any re-underwrite -> cut; (3) horizon expiry without re-underwrite -> exit.",
].join("\n");

describe("hasStructure", () => {
  it("detects labeled sections", () => {
    expect(hasStructure(STRUCTURED_THESIS)).toBe(true);
  });

  it("rejects legacy prose", () => {
    expect(hasStructure("Adobe is a deep-value quality name with **bold** words.")).toBe(
      false,
    );
  });
});

describe("parseThesisSections", () => {
  it("returns a single unlabeled paragraph for legacy prose", () => {
    const sections = parseThesisSections("Plain prose thesis, one blob.");
    expect(sections).toEqual([
      { kind: "paragraph", label: null, text: "Plain prose thesis, one blob." },
    ]);
  });

  it("parses all five section shapes", () => {
    const sections = parseThesisSections(STRUCTURED_THESIS);
    expect(sections.map((s) => [s.label, s.kind])).toEqual([
      ["Claim", "paragraph"],
      ["Evidence", "numbered"],
      ["What must be true", "bullets"],
      ["Conviction worksheet", "table"],
      ["Exit paths (IPS v3 — no price-target exits by design)", "numbered"],
    ]);
  });

  it("keeps claim text and strips markdown", () => {
    const [claim] = parseThesisSections(STRUCTURED_THESIS);
    expect(claim).toMatchObject({
      kind: "paragraph",
      text: "The market prices Creative Cloud as terminal decline; the bet is deceleration-not-decline.",
    });
  });

  it("parses numbered evidence items", () => {
    const evidence = parseThesisSections(STRUCTURED_THESIS)[1];
    if (evidence.kind !== "numbered") throw new Error("expected numbered");
    expect(evidence.items).toHaveLength(3);
    expect(evidence.items[0]).toContain("Valuation at decade lows");
  });

  it("splits mid-dot lists into bullets", () => {
    const mustBeTrue = parseThesisSections(STRUCTURED_THESIS)[2];
    if (mustBeTrue.kind !== "bullets") throw new Error("expected bullets");
    expect(mustBeTrue.items).toEqual([
      "organic cc ARR >=8% y/y through FY27",
      "margins hold near the ~45% guide",
      "pricing power resumes (no second deferral).",
    ]);
  });

  it("parses the worksheet table with footer and no separator row", () => {
    const table = parseThesisSections(STRUCTURED_THESIS)[3];
    if (table.kind !== "table") throw new Error("expected table");
    expect(table.header).toEqual(["pillar", "score", "anchoring fact"]);
    expect(table.rows).toEqual([
      ["moat/quality", "4", "36% ROIC franchise"],
      ["growth durability", "2", "organic ~10.4% -> guided ~8%"],
    ]);
    expect(table.footer).toBe("Mean 3.75 -> structural cap 3. Conviction 3.");
  });

  it("expands inline (1)/(2) enumerations", () => {
    const exits = parseThesisSections(STRUCTURED_THESIS)[4];
    if (exits.kind !== "numbered") throw new Error("expected numbered");
    expect(exits.items).toHaveLength(3);
    expect(exits.items[1]).toContain("conviction <3");
  });
});

describe("parseCounterPoints", () => {
  it("splits enumerated counters", () => {
    const points = parseCounterPoints(
      "(1) First counter — evidence. (2) Second counter. (3) Third. Verdict: survives.",
    );
    expect(points).toHaveLength(3);
    expect(points?.[2]).toContain("Verdict: survives");
  });

  it("returns null for essay-style counters", () => {
    expect(parseCounterPoints("One long essay without enumeration.")).toBeNull();
  });
});

describe("splitNoteSegments", () => {
  it("splits at sentence boundaries without breaking decimals", () => {
    const segments = splitNoteSegments(
      "Anchors: rising 50-DMA 229.8 · 10x FY26 EPS ~ 244. Band 230-244 = 50-DMA-to-10x cluster. Mid 237: risk -20.7%; reward +44% -> R/R 2.1:1 PASS.",
    );
    expect(segments).toEqual([
      "Anchors: rising 50-DMA 229.8 · 10x FY26 EPS ~ 244.",
      "Band 230-244 = 50-DMA-to-10x cluster.",
      "Mid 237: risk -20.7%; reward +44% -> R/R 2.1:1 PASS.",
    ]);
  });

  it("returns null for single-sentence notes", () => {
    expect(splitNoteSegments("One short condition only.")).toBeNull();
  });
});

describe("splitContextSegments", () => {
  it("splits on semicolons and drops the trailing period", () => {
    const segments = splitContextSegments(
      "Price $265.21 (2026-08-10); 50-DMA $229.79 rising; consensus PT $261; next earnings 2026-09-10.",
    );
    expect(segments).toEqual([
      "Price $265.21 (2026-08-10)",
      "50-DMA $229.79 rising",
      "consensus PT $261",
      "next earnings 2026-09-10",
    ]);
  });

  it("returns null without semicolons", () => {
    expect(splitContextSegments("Price $265.21 only")).toBeNull();
  });
});

describe("stripInlineMarkdown", () => {
  it("removes bold and code markers", () => {
    expect(stripInlineMarkdown("**Conviction 3.** at `11x` fwd")).toBe(
      "Conviction 3. at 11x fwd",
    );
  });
});
