import { ImportWizard } from "@/components/domain/import-wizard";

export default function ImportPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-zinc-900">Import Transactions</h2>
      <ImportWizard />
    </div>
  );
}
