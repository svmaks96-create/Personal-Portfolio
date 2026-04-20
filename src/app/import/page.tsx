import { ImportWizard } from "@/components/domain/import-wizard";
import { TerminalHeading } from "@/components/domain/terminal-heading";

export default function ImportPage() {
  return (
    <div className="space-y-4 font-mono text-[13px] tabular-nums">
      <TerminalHeading segments={["IMPORT", "TRANSACTIONS", "XLSX"]} />
      <ImportWizard />
    </div>
  );
}
