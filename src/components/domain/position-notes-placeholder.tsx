interface PositionNotesPlaceholderProps {
  ticker: string;
}

export function PositionNotesPlaceholder({
  ticker,
}: PositionNotesPlaceholderProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="border-b border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        [ THESIS / NOTES ]
      </div>
      <div className="px-5 py-6 font-mono text-[13px] leading-relaxed text-muted-foreground">
        No thesis recorded for {ticker}. Position-level notes are not yet
        editable.
      </div>
    </div>
  );
}
