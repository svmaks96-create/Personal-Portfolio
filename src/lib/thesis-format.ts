/**
 * Parser for the structured thesis format written by the underwriting skills
 * (Claim / Evidence / What must be true / Conviction worksheet / Exit paths).
 *
 * Pure and client-safe: no server imports. The source of truth stays the plain
 * `thesis` text column — this module only derives a display structure from it,
 * and legacy prose-only records fall through as a single paragraph section.
 */

export type ThesisSection =
  | { kind: "paragraph"; label: string | null; text: string }
  | { kind: "numbered"; label: string | null; items: string[] }
  | { kind: "bullets"; label: string | null; items: string[] }
  | {
      kind: "table";
      label: string | null;
      header: string[];
      rows: string[][];
      footer: string | null;
    };

/** `**Label:**` or `**Label (note):**` at the start of a line. */
const SECTION_LABEL = /^\*\*([^*]+?):?\*\*:?\s*/;

const NUMBERED_ITEM = /^\d+\.\s+/;
const BULLET_ITEM = /^[-•]\s+/;
/** Inline enumeration: `(1) … (2) …` inside one paragraph. */
const INLINE_ENUM = /\(\d+\)\s+/;
const TABLE_ROW = /^\|(.+)\|\s*$/;
const TABLE_SEPARATOR = /^\|[\s:|-]+\|\s*$/;

export function stripInlineMarkdown(text: string): string {
  return text.replace(/\*\*([^*]*)\*\*/g, "$1").replace(/`([^`]*)`/g, "$1");
}

export function hasStructure(text: string): boolean {
  return text.split("\n").some((line) => SECTION_LABEL.test(line.trim()));
}

interface RawSection {
  label: string | null;
  lines: string[];
}

function splitIntoRawSections(text: string): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection = { label: null, lines: [] };
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(SECTION_LABEL);
    if (match) {
      if (current.label !== null || current.lines.some((l) => l !== "")) {
        sections.push(current);
      }
      const rest = line.slice(match[0].length).trim();
      current = { label: match[1].trim(), lines: rest === "" ? [] : [rest] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.label !== null || current.lines.some((l) => l !== "")) {
    sections.push(current);
  }
  return sections;
}

function parseTable(
  label: string | null,
  lines: string[],
): Extract<ThesisSection, { kind: "table" }> | null {
  const tableLines = lines.filter((l) => TABLE_ROW.test(l));
  if (tableLines.length < 2) return null;
  const cells = (l: string): string[] =>
    l
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => stripInlineMarkdown(c.trim()));
  const [headerLine, ...bodyLines] = tableLines;
  const rows = bodyLines
    .filter((l) => !TABLE_SEPARATOR.test(l))
    .map(cells)
    .filter((r) => r.some((c) => c !== ""));
  const footerLines = lines.filter((l) => l !== "" && !TABLE_ROW.test(l));
  return {
    kind: "table",
    label,
    header: cells(headerLine),
    rows,
    footer:
      footerLines.length > 0
        ? stripInlineMarkdown(footerLines.join(" "))
        : null,
  };
}

function parseSection(raw: RawSection): ThesisSection {
  const lines = raw.lines.filter((l) => l !== "");
  const label = raw.label;

  if (lines.some((l) => TABLE_ROW.test(l))) {
    const table = parseTable(label, lines);
    if (table) return table;
  }

  if (lines.length > 0 && lines.every((l) => NUMBERED_ITEM.test(l))) {
    return {
      kind: "numbered",
      label,
      items: lines.map((l) => stripInlineMarkdown(l.replace(NUMBERED_ITEM, ""))),
    };
  }

  if (lines.length > 0 && lines.every((l) => BULLET_ITEM.test(l))) {
    return {
      kind: "bullets",
      label,
      items: lines.map((l) => stripInlineMarkdown(l.replace(BULLET_ITEM, ""))),
    };
  }

  const text = lines.join(" ");

  const enumParts = text.split(INLINE_ENUM).filter((p) => p.trim() !== "");
  if (enumParts.length >= 2 && INLINE_ENUM.test(text)) {
    return {
      kind: "numbered",
      label,
      items: enumParts.map((p) => stripInlineMarkdown(p.trim())),
    };
  }

  const dotParts = text.split(" · ");
  if (dotParts.length >= 3) {
    return {
      kind: "bullets",
      label,
      items: dotParts.map((p) => stripInlineMarkdown(p.trim())),
    };
  }

  return { kind: "paragraph", label, text: stripInlineMarkdown(text) };
}

export function parseThesisSections(text: string): ThesisSection[] {
  if (!hasStructure(text)) {
    return [{ kind: "paragraph", label: null, text: stripInlineMarkdown(text) }];
  }
  return splitIntoRawSections(text).map(parseSection);
}

/**
 * Splits a level/catalyst note into display rows at sentence boundaries
 * (". " followed by a capital or digit). Returns null when the note is a
 * single segment — callers render those as a plain paragraph.
 */
export function splitNoteSegments(text: string): string[] | null {
  const segments = text
    .split(/(?<=\.)\s+(?=[A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s !== "");
  return segments.length >= 2 ? segments.map(stripInlineMarkdown) : null;
}

/**
 * Splits a technical-context line into chip segments on "; " boundaries.
 * Returns null when there are fewer than two segments.
 */
export function splitContextSegments(text: string): string[] | null {
  const segments = text
    .split(/;\s+/)
    .map((s) => s.trim().replace(/\.$/, ""))
    .filter((s) => s !== "");
  return segments.length >= 2 ? segments.map(stripInlineMarkdown) : null;
}

/**
 * Critique counters are written as `(1) claim — evidence → impact (2) … Verdict: …`.
 * Returns null when the text has no enumeration (legacy essay-style counters).
 */
export function parseCounterPoints(text: string): string[] | null {
  const parts = text.split(INLINE_ENUM).map((p) => p.trim());
  const [preamble, ...items] = parts;
  if (items.length < 2) return null;
  const result = items.map(stripInlineMarkdown);
  if (preamble !== "") result.unshift(stripInlineMarkdown(preamble));
  return result;
}
