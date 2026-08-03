import { Skeleton } from "@/components/ui/skeleton";

function PanelSkeleton({ rows, minHeight }: { rows: number; minHeight: string }) {
  return (
    <div className={`flex ${minHeight} flex-col border border-line bg-panel`}>
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-24" />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3.5 w-full" />
        ))}
      </div>
    </div>
  );
}

export function AnalyticsPanelSkeleton({ rows = 8 }: { rows?: number }) {
  return <PanelSkeleton rows={rows} minHeight="min-h-[240px]" />;
}

export function AnalyticsCaveatsSkeleton() {
  return <PanelSkeleton rows={6} minHeight="min-h-[180px]" />;
}

export function AnalyticsPairSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <PanelSkeleton rows={rows} minHeight="min-h-[240px]" />
      <PanelSkeleton rows={rows} minHeight="min-h-[240px]" />
    </div>
  );
}

export function AnalyticsBehaviourSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 border border-line bg-panel">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 border-r border-line px-4 py-3.5 last:border-r-0"
          >
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-2.5 w-16" />
          </div>
        ))}
      </div>
      <AnalyticsPairSkeleton rows={5} />
      <PanelSkeleton rows={7} minHeight="min-h-[220px]" />
    </div>
  );
}
