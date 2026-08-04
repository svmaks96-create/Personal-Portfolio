import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatting";
import { ApplyTargetButton } from "@/components/domain/apply-target-button";
import type { ResearchRosterRow } from "@/server/queries/theses";

const DASH = "—";
const APPLY_TOLERANCE = 0.005;

interface ResearchRosterProps {
  roster: ResearchRosterRow[];
}

export function ResearchRoster({ roster }: ResearchRosterProps) {
  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          Finalized Roster
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {roster.length} thes{roster.length === 1 ? "is" : "es"}
        </span>
      </div>
      {roster.length === 0 ? (
        <div className="px-3.5 py-8 text-center font-mono text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
          No finalized theses yet — review a draft above or run /underwrite-name
        </div>
      ) : (
        <table className="w-full table-fixed font-mono tabular-nums">
          <thead>
            <tr className="border-b border-line bg-panel-strong text-[9px] uppercase tracking-[0.22em] text-muted-foreground">
              <th className="w-[80px] px-3.5 py-2 text-left font-normal">Ticker</th>
              <th className="w-[70px] px-3.5 py-2 text-left font-normal">Bucket</th>
              <th className="w-[80px] px-3.5 py-2 text-center font-normal">Conv/Rank</th>
              <th className="w-[70px] px-3.5 py-2 text-center font-normal">Posture</th>
              <th className="px-3.5 py-2 text-right font-normal">Horizon</th>
              <th className="px-3.5 py-2 text-right font-normal">Ladder</th>
              <th className="px-3.5 py-2 text-right font-normal">Reconciled</th>
              <th className="px-3.5 py-2 text-right font-normal">Model</th>
              <th className="px-3.5 py-2 text-right font-normal">Real</th>
              <th className="w-[110px] px-3.5 py-2 text-center font-normal">Apply</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((row) => {
              const applyNeeded =
                row.applyPreview !== null &&
                Math.abs(
                  row.applyPreview.weightAfter - row.applyPreview.weightBefore,
                ) > APPLY_TOLERANCE;
              return (
                <tr
                  key={row.ticker}
                  className="border-b border-line text-[12px] last:border-b-0"
                >
                  <td className="px-3.5 py-[7px]">
                    <Link
                      href={`/positions/${row.ticker}`}
                      className="underline decoration-line underline-offset-2 hover:decoration-foreground"
                    >
                      {row.ticker}
                    </Link>
                  </td>
                  <td className="px-3.5 py-[7px] text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                    {row.bucket}
                  </td>
                  <td className="px-3.5 py-[7px] text-center">
                    {row.conviction ?? DASH}/{row.promiseRank ?? DASH}
                  </td>
                  <td className="px-3.5 py-[7px] text-center">
                    <span
                      className={cn(
                        "inline-block border px-1.5 text-[9px] uppercase tracking-[0.14em]",
                        row.keepDecision === "cut"
                          ? "border-neg text-neg"
                          : row.keepDecision === "keep"
                            ? "border-line text-foreground"
                            : "border-line text-muted-foreground",
                      )}
                    >
                      {row.keepDecision ?? DASH}
                    </span>
                  </td>
                  <td className="px-3.5 py-[7px] text-right text-[11px]">
                    {row.horizonMonths === null
                      ? DASH
                      : `${row.horizonMonths}mo → ${formatDate(row.expiresAt)}`}
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {row.targetWeightPct.display}
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {row.reconciledWeightPct.display}
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {row.allocationWeightPct.display}
                  </td>
                  <td className="px-3.5 py-[7px] text-right">
                    {row.realWeightPct.display}
                  </td>
                  <td className="px-3.5 py-[7px] text-center">
                    {row.applyPreview !== null && applyNeeded ? (
                      <ApplyTargetButton
                        ticker={row.ticker}
                        preview={row.applyPreview}
                      />
                    ) : row.applyPreview !== null ? (
                      <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                        In sync
                      </span>
                    ) : (
                      DASH
                    )}
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
