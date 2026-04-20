import { Skeleton } from "@/components/ui/skeleton";

function KpiCellSkeleton() {
  return (
    <div className="flex flex-col gap-2 border-r border-line px-4 py-3.5 last:border-r-0">
      <Skeleton className="h-[9px] w-24" />
      <Skeleton className="h-[22px] w-28" />
      <Skeleton className="h-[10px] w-16" />
    </div>
  );
}

export function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-5 border border-line bg-panel">
      <KpiCellSkeleton />
      <KpiCellSkeleton />
      <KpiCellSkeleton />
      <KpiCellSkeleton />
      <KpiCellSkeleton />
    </div>
  );
}
