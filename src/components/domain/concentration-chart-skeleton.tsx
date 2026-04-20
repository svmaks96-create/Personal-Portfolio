import { Skeleton } from "@/components/ui/skeleton";

export function ConcentrationChartSkeleton() {
  return (
    <div className="flex min-h-[420px] flex-col border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2">
        <Skeleton className="h-3 w-44" />
      </div>
      <div className="flex-1 space-y-2 p-3.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div className="flex justify-between">
              <Skeleton className="h-2.5 w-14" />
              <Skeleton className="h-2.5 w-10" />
            </div>
            <Skeleton className="h-2 w-full" style={{ maxWidth: `${95 - i * 6}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}
