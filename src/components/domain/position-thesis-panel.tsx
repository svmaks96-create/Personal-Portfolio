import Link from "next/link";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatting";
import {
  CritiqueCounterView,
  NoteView,
  ThesisStructuredView,
} from "@/components/domain/thesis-structured-view";
import type { ThesisRecord } from "@/server/queries/theses";

const DASH = "—";

interface PositionThesisPanelProps {
  ticker: string;
  current: ThesisRecord | null;
  hasDraft: boolean;
  history: ThesisRecord[];
}

export function PositionThesisPanel({
  ticker,
  current,
  hasDraft,
  history,
}: PositionThesisPanelProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <span>[ THESIS ]</span>
        {current && (
          <span className="flex items-center gap-2">
            <span className="border border-line px-1.5 text-[9px] tracking-[0.14em] text-muted-foreground">
              v{current.version} · {current.bucket}
            </span>
            <span className="border border-pos px-1.5 text-[9px] tracking-[0.14em] text-pos">
              Final
            </span>
          </span>
        )}
      </div>

      {hasDraft && (
        <div className="border-b border-line bg-panel-strong px-3.5 py-2 font-mono text-[11px] text-foreground">
          A draft underwriting is pending review —{" "}
          <Link
            href="/research"
            className="underline decoration-line underline-offset-2 hover:decoration-foreground"
          >
            review it on /research
          </Link>
        </div>
      )}

      {!current ? (
        <div className="px-5 py-6 font-mono text-[12px] leading-relaxed text-muted-foreground">
          No underwritten thesis for {ticker}.
          {!hasDraft && " Run /underwrite-name to draft one."}
        </div>
      ) : (
        <div className="px-3.5 py-3">
          {/* Scores strip */}
          <div className="flex flex-wrap gap-5 font-mono text-[11px]">
            <Stat label="Conviction" value={s(current.conviction)} />
            <Stat label="Promise" value={s(current.promiseRank)} />
            <Stat
              label="Decision"
              value={current.keepDecision ?? DASH}
              tone={current.keepDecision === "cut" ? "neg" : undefined}
            />
            <Stat
              label="Ladder target"
              value={
                current.targetWeightPct === null
                  ? DASH
                  : `${current.targetWeightPct}%`
              }
            />
            <Stat label="Sector" value={current.sector ?? DASH} />
            <Stat label="Horizon" value={horizonDisplay(current)} />
            <Stat
              label="Add-down"
              value={current.addDownState}
              tone={current.addDownState !== "available" ? "muted" : undefined}
            />
          </div>

          {current.thesis && (
            <ThesisStructuredView text={current.thesis} className="mt-3" />
          )}

          {current.breakConditionsList.length > 0 && (
            <div className="mt-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                Break conditions — any one verified true ⇒ full exit
              </div>
              <ol className="mt-1 list-inside list-decimal space-y-0.5 font-mono text-[12px] text-foreground">
                {current.breakConditionsList.map((bc, i) => (
                  <li key={i}>{bc}</li>
                ))}
              </ol>
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-3">
            {current.keyRisk && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Key risk
                </div>
                <NoteView text={current.keyRisk} className="mt-0.5" />
              </div>
            )}
            {current.catalyst && (
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Catalyst
                </div>
                <NoteView text={current.catalyst} className="mt-0.5" />
              </div>
            )}
          </div>

          {current.critiqueCounter && (
            <div className="mt-3 border border-line bg-panel-strong px-2.5 py-1.5 font-mono text-[11px] leading-relaxed text-foreground">
              <span
                className={cn(
                  "mb-1 inline-block border px-1.5 text-[9px] uppercase tracking-[0.14em]",
                  current.critiqueVerdict === "overturned"
                    ? "border-neg text-neg"
                    : "border-line text-muted-foreground",
                )}
              >
                Critique {current.critiqueVerdict ?? "counter"}
              </span>
              <CritiqueCounterView text={current.critiqueCounter} />
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-4 font-mono text-[10px] text-muted-foreground">
            <span>Reviewed {formatDate(current.reviewedAt)}</span>
            <span>Source {current.source.replace(/_/g, "-")}</span>
            {current.changeReason && <span>Δ {current.changeReason}</span>}
          </div>

          {history.length > 1 && (
            <details className="mt-3 border-t border-line pt-2">
              <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
                Version history ({history.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="flex flex-wrap items-baseline gap-2 font-mono text-[11px] text-foreground"
                  >
                    <span className="text-muted-foreground">v{h.version}</span>
                    <span
                      className={cn(
                        "border px-1 text-[9px] uppercase tracking-[0.12em]",
                        h.status === "final"
                          ? "border-pos text-pos"
                          : h.status === "rejected"
                            ? "border-neg text-neg"
                            : "border-line text-muted-foreground",
                      )}
                    >
                      {h.status}
                    </span>
                    <span className="text-muted-foreground">
                      {formatDate(h.reviewedAt ?? h.createdAt)}
                    </span>
                    <span>
                      conv {s(h.conviction)} · {h.keepDecision ?? DASH}
                      {h.changeReason ? ` · ${h.changeReason}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}

function s(v: number | null): string {
  return v === null ? DASH : String(v);
}

function horizonDisplay(t: ThesisRecord): string {
  if (t.horizonMonths === null) return DASH;
  if (t.expiresAt === null) return `${t.horizonMonths}mo`;
  const days = differenceInCalendarDays(parseISO(t.expiresAt), new Date());
  const countdown =
    days < 0 ? "EXPIRED" : days === 0 ? "expires today" : `${days}d left`;
  return `${t.horizonMonths}mo · ${countdown}`;
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "neg" | "muted";
}) {
  return (
    <span>
      <span className="mr-1.5 text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "text-foreground",
          tone === "neg" && "text-neg",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </span>
  );
}
