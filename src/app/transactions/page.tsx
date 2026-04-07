import { EmptyState } from "@/components/domain/empty-state";
import { getTransactionCount } from "@/server/queries/transactions";

export default function TransactionsPage() {
  const count = getTransactionCount();

  if (count === 0) {
    return <EmptyState message="No transactions yet" />;
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold text-zinc-900">Transactions</h2>
    </div>
  );
}
