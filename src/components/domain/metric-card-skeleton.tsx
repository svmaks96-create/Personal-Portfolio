import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

function MetricCardSkeleton() {
  return (
    <Card className="bg-card shadow-sm ring-0">
      <CardContent>
        <Skeleton className="h-[13px] w-24 mb-2" />
        <Skeleton className="h-[28px] w-32" />
      </CardContent>
    </Card>
  );
}

export function MetricCardsSkeleton() {
  return (
    <div className="grid grid-cols-5 gap-4">
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
      <MetricCardSkeleton />
    </div>
  );
}
