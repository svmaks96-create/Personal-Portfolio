import { TerminalHeading } from "@/components/domain/terminal-heading";
import { AllocationEditor } from "@/components/domain/allocation-editor";
import { getAllocationModel } from "@/server/queries/allocation-targets";

export default function AllocationPage() {
  const model = getAllocationModel();

  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading
        section="ALLOCATION"
        segments={["ALLOCATION", "TARGET MODEL"]}
        showDate={false}
        right={`${model.rows.length} Row${model.rows.length === 1 ? "" : "s"}`}
      />
      <AllocationEditor
        rows={model.rows}
        totalTargetWeight={model.totalTargetWeight}
        totalCashUsd={model.totalCashUsd}
      />
    </div>
  );
}
