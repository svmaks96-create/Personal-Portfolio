import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ConstructionTriggerRow } from "@/server/queries/construction";

const KIND_LABELS: Record<ConstructionTriggerRow["kind"], string> = {
  entry: "Entry zone",
  add_down: "Add-down",
  backstop_review: "Backstop review",
  expiry_review: "Expiry review",
};

interface ConstructionTriggersTableProps {
  triggers: ConstructionTriggerRow[];
  watchedLevelCount: number;
}

export function ConstructionTriggersTable({
  triggers,
  watchedLevelCount,
}: ConstructionTriggersTableProps) {
  const reviewCount = triggers.filter(
    (t) =>
      t.triggered &&
      (t.kind === "backstop_review" || t.kind === "expiry_review"),
  ).length;

  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          Triggered Levels · Review Demands
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {reviewCount} review{reviewCount === 1 ? "" : "s"} due ·{" "}
          {watchedLevelCount} level{watchedLevelCount === 1 ? "" : "s"} quiet
        </span>
      </div>
      {triggers.length === 0 ? (
        <div className="px-3.5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          No triggered levels — nothing demands a decision
        </div>
      ) : (
        <table className="w-full table-fixed font-mono tabular-nums">
          <thead>
            <tr className="border-b border-line bg-panel-strong text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              <th className="w-[90px] px-3.5 py-2 text-left font-normal">Ticker</th>
              <th className="w-[130px] px-3.5 py-2 text-left font-normal">Kind</th>
              <th className="px-3.5 py-2 text-right font-normal">Level</th>
              <th className="px-3.5 py-2 text-right font-normal">Last</th>
              <th className="px-3.5 py-2 text-right font-normal">Dist</th>
              <th className="w-[110px] px-3.5 py-2 text-right font-normal">Due</th>
              <th className="w-[40%] px-3.5 py-2 text-left font-normal">Demand</th>
            </tr>
          </thead>
          <tbody>
            {triggers.map((t, i) => {
              const isReview =
                t.kind === "backstop_review" || t.kind === "expiry_review";
              return (
                <tr
                  key={`${t.ticker}-${t.kind}-${i}`}
                  className="border-b border-line text-[12px] last:border-b-0"
                >
                  <td className="px-3.5 py-[7px]">
                    <Link
                      href={`/positions/${t.ticker}`}
                      className="underline decoration-line underline-offset-2 hover:decoration-foreground"
                    >
                      {t.ticker}
                    </Link>
                  </td>
                  <td className="px-3.5 py-[7px]">
                    <span
                      className={cn(
                        "inline-block border px-1.5 text-[9px] uppercase tracking-[0.14em]",
                        t.triggered && isReview
                          ? "border-neg text-neg"
                          : t.triggered
                            ? "border-pos text-pos"
                            : "border-line text-muted-foreground",
                      )}
                    >
                      {KIND_LABELS[t.kind]}
                    </span>
                  </td>
                  <td className="px-3.5 py-[7px] text-right">{t.levelPrice.display}</td>
                  <td className="px-3.5 py-[7px] text-right">{t.lastPrice.display}</td>
                  <td className="px-3.5 py-[7px] text-right">{t.distancePct.display}</td>
                  <td className="px-3.5 py-[7px] text-right">{t.dueDate.display}</td>
                  <td className="px-3.5 py-[7px] text-[11px] text-muted-foreground">
                    {t.suppressedBy !== null
                      ? `Suppressed by pending ${KIND_LABELS[t.suppressedBy].toLowerCase()} — no buying into an un-reviewed thesis`
                      : (t.note ??
                        (t.triggered && t.kind === "entry"
                          ? "Price inside the entry zone"
                          : t.triggered && t.kind === "add_down"
                            ? "Pre-committed add-down level reached"
                            : ""))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
