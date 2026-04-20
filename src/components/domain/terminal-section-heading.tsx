import type { ReactNode } from "react";

interface TerminalSectionHeadingProps {
  label: string;
  tag?: string;
  hint?: string;
  right?: ReactNode;
}

export function TerminalSectionHeading({
  label,
  tag,
  hint,
  right,
}: TerminalSectionHeadingProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-2.5 pt-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
      <div>
        <span>[ {label.toUpperCase()} ]</span>
        {tag ? <span className="ml-2 text-foreground">{tag.toUpperCase()}</span> : null}
      </div>
      {right ?? (hint ? <span>{hint}</span> : null)}
    </div>
  );
}
