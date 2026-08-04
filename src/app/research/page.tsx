import { TerminalHeading } from "@/components/domain/terminal-heading";
import { ResearchDraftQueue } from "@/components/domain/research-draft-queue";
import { ResearchRoster } from "@/components/domain/research-roster";
import { getResearchPageData } from "@/server/queries/theses";

export default function ResearchPage() {
  const { drafts, roster } = getResearchPageData();

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading
        section="RESEARCH"
        segments={["RESEARCH", "THESIS PIPELINE"]}
        showDate={false}
        right={`${drafts.length} Draft${drafts.length === 1 ? "" : "s"} · ${roster.length} Final`}
      />
      <ResearchDraftQueue drafts={drafts} />
      <ResearchRoster roster={roster} />
      <div className="border border-line bg-panel px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Drafts arrive via /underwrite-name and /portfolio-review skills — finalize
        here is the only path to a live thesis · trades stay manual in IBKR
      </div>
    </div>
  );
}
