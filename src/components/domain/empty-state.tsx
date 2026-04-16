import Link from "next/link";

interface EmptyStateProps {
  message: string;
  actionLabel?: string;
  actionHref?: string;
}

export function EmptyState({ message, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-24">
      <p className="text-muted-foreground text-base">{message}</p>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="mt-4 inline-flex items-center px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}
