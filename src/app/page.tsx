import { EmptyState } from "@/components/domain/empty-state";
import { getTransactionCount } from "@/server/queries/transactions";

export default function DashboardPage() {
  const count = getTransactionCount();

  if (count === 0) {
    return (
      <EmptyState
        message="No positions yet. Import transactions to get started."
        actionLabel="Import Transactions"
        actionHref="/import"
      />
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-zinc-900">Dashboard</h2>
    </div>
  );
}
