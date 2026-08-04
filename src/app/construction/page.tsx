import { TerminalHeading } from "@/components/domain/terminal-heading";
import { ConstructionRollupTable } from "@/components/domain/construction-rollup-table";
import { ConstructionViolations } from "@/components/domain/construction-violations";
import { ConstructionTriggersTable } from "@/components/domain/construction-triggers-table";
import { getConstructionData } from "@/server/queries/construction";

export default function ConstructionPage() {
  const data = getConstructionData();

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading
        section="CONSTRUCTION"
        segments={["CONSTRUCTION", "POLICY GUIDELINES"]}
        showDate={false}
        right={`${data.warnCount} Warn · ${data.infoCount} Info`}
      />
      <ConstructionRollupTable rollups={data.rollups} />
      <ConstructionViolations
        violations={data.violations}
        warnCount={data.warnCount}
        infoCount={data.infoCount}
      />
      <ConstructionTriggersTable
        triggers={data.triggers}
        watchedLevelCount={data.watchedLevelCount}
      />
      <div className="border border-line bg-panel px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        Advisory only — policy source: docs/investment-policy.md · edit targets on
        /allocation
      </div>
    </div>
  );
}
