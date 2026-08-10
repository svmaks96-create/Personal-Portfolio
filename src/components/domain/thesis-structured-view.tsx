import { cn } from "@/lib/utils";
import {
  parseCounterPoints,
  parseThesisSections,
  splitContextSegments,
  splitNoteSegments,
  type ThesisSection,
} from "@/lib/thesis-format";

const labelClasses =
  "font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground";

interface ThesisStructuredViewProps {
  text: string;
  className?: string;
}

/**
 * Renders a thesis written in the structured underwriting format (Claim /
 * Evidence / worksheet table / Exit paths) as typed blocks instead of raw
 * markdown. Legacy prose theses render as a single paragraph.
 */
export function ThesisStructuredView({
  text,
  className,
}: ThesisStructuredViewProps) {
  const sections = parseThesisSections(text);
  return (
    <div className={cn("space-y-2.5", className)}>
      {sections.map((section, i) => (
        <Section key={i} section={section} />
      ))}
    </div>
  );
}

function Section({ section }: { section: ThesisSection }) {
  return (
    <div>
      {section.label && <div className={labelClasses}>{section.label}</div>}
      <SectionBody section={section} />
    </div>
  );
}

function SectionBody({ section }: { section: ThesisSection }) {
  switch (section.kind) {
    case "paragraph":
      return (
        <p className="mt-0.5 font-mono text-[12px] leading-relaxed text-foreground">
          {section.text}
        </p>
      );
    case "numbered":
      return (
        <ol className="mt-0.5 space-y-0.5 font-mono text-[12px] leading-relaxed text-foreground">
          {section.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {i + 1}.
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ol>
      );
    case "bullets":
      return (
        <ul className="mt-0.5 space-y-0.5 font-mono text-[12px] leading-relaxed text-foreground">
          {section.items.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 text-muted-foreground">·</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div className="mt-1">
          <table className="w-full border border-line font-mono text-[11px]">
            <thead>
              <tr className="border-b border-line bg-panel-strong">
                {section.header.map((cell, i) => (
                  <th
                    key={i}
                    className="px-2 py-1 text-left font-normal uppercase tracking-[0.14em] text-[9px] text-muted-foreground"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {section.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className={cn(
                        "px-2 py-1 align-top text-foreground",
                        j === 1 && "tabular-nums",
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {section.footer && (
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-foreground">
              {section.footer}
            </p>
          )}
        </div>
      );
  }
}

interface NoteViewProps {
  text: string;
  className?: string;
}

/**
 * Renders a level note / catalyst / key risk as one row per sentence segment
 * (Anchors, band, R/R math, subscores each on their own line). Single-segment
 * notes stay a plain paragraph.
 */
export function NoteView({ text, className }: NoteViewProps) {
  const segments = splitNoteSegments(text);
  if (segments === null) {
    return (
      <p
        className={cn(
          "font-mono text-[11px] leading-relaxed text-foreground",
          className,
        )}
      >
        {text}
      </p>
    );
  }
  return (
    <ul
      className={cn(
        "space-y-0.5 font-mono text-[11px] leading-relaxed text-foreground",
        className,
      )}
    >
      {segments.map((segment, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 text-muted-foreground">·</span>
          <span>{segment}</span>
        </li>
      ))}
    </ul>
  );
}

interface TechnicalContextChipsProps {
  text: string;
  className?: string;
}

/** Renders a technical-context line as bordered data chips. */
export function TechnicalContextChips({
  text,
  className,
}: TechnicalContextChipsProps) {
  const segments = splitContextSegments(text);
  if (segments === null) {
    return (
      <span className={cn("font-mono text-[10px] text-muted-foreground", className)}>
        {text}
      </span>
    );
  }
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {segments.map((segment, i) => (
        <span
          key={i}
          className="border border-line bg-card px-1.5 py-0.5 font-mono text-[10px] text-foreground"
        >
          {segment}
        </span>
      ))}
    </div>
  );
}

interface CritiqueCounterViewProps {
  text: string;
}

/**
 * Renders a critique counter as numbered counterpoints when it uses the
 * `(1) … (2) …` format; falls back to plain text for legacy essay counters.
 */
export function CritiqueCounterView({ text }: CritiqueCounterViewProps) {
  const points = parseCounterPoints(text);
  if (points === null) {
    return <span>{text}</span>;
  }
  return (
    <ol className="space-y-1">
      {points.map((point, i) => (
        <li key={i} className="flex gap-2">
          <span className="shrink-0 tabular-nums text-muted-foreground">
            {i + 1}.
          </span>
          <span>{point}</span>
        </li>
      ))}
    </ol>
  );
}
