import Link from "next/link";
import { TerminalHeading } from "@/components/domain/terminal-heading";
import { ScreeningControls } from "@/components/domain/screening-controls";
import { ScreeningResultsTable } from "@/components/domain/screening-results-table";
import { ScreeningWatchlistTable } from "@/components/domain/screening-watchlist-table";
import { getScreeningPageData } from "@/server/queries/screening";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/formatting";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function ScreeningPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const activeTab = tab === "watchlist" ? "watchlist" : "results";
  const data = getScreeningPageData();

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading
        section="SCREENING"
        segments={["SCREENING", "QUANT PRE-SCORE"]}
        showDate={false}
        right={
          data.run
            ? `Run #${data.run.id} · ${formatDate(data.run.runDate)} · ${data.run.scoredCount}/${data.run.universeCount} scored`
            : "No runs yet"
        }
      />

      <ScreeningControls lastCriteria={data.run?.criteria ?? null} />

      {data.run?.capTruncated && (
        <div className="border border-line bg-panel px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          ⚠ Run #{data.run.id} hit the {data.run.criteria?.limit} safety cap —
          the smallest names above the floor were cut. Narrow the market-cap
          band or raise the cap for full coverage.
        </div>
      )}

      <div className="flex gap-1 border-b border-line">
        {(
          [
            ["results", `Results (${data.results.length})`],
            ["watchlist", `Watchlist (${data.watchlistRows.length})`],
          ] as const
        ).map(([key, label]) => (
          <Link
            key={key}
            href={key === "results" ? "/screening" : "/screening?tab=watchlist"}
            className={cn(
              "border border-b-0 border-line px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.18em]",
              activeTab === key
                ? "bg-panel text-foreground"
                : "bg-panel-strong text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {activeTab === "results" ? (
        <ScreeningResultsTable
          results={data.results}
          runId={data.run?.id ?? null}
        />
      ) : (
        <ScreeningWatchlistTable rows={data.watchlistRows} />
      )}

      <div className="border border-line bg-panel px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Quant ranks are a funnel, not a verdict — flag names for research, then
        run /underwrite-name · new names wait out the 7-day cooling period after
        finalization
      </div>
    </div>
  );
}
