import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function ConcentrationChartSkeleton() {
  return (
    <Card className="bg-white shadow-sm ring-0">
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton
                className="h-5 flex-1 rounded-sm"
                style={{ maxWidth: `${90 - i * 8}%` }}
              />
              <Skeleton className="h-4 w-12 shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
