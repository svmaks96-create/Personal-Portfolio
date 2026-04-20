import { Skeleton } from "@/components/ui/skeleton";

export function PerformanceSkeleton() {
  return (
    <div className="flex min-h-[420px] flex-col border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <Skeleton className="h-3 w-48" />
        <Skeleton className="h-5 w-44" />
      </div>
      <div className="flex flex-1 flex-col p-3.5">
        <Skeleton className="flex-1" />
        <div className="mt-3 flex gap-6 border-t border-line-soft pt-3">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-28" />
        </div>
      </div>
    </div>
  );
}
