import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function PerformanceSkeleton() {
  return (
    <Card className="bg-card shadow-sm ring-0">
      <CardHeader>
        <Skeleton className="h-5 w-56" />
        <Skeleton className="h-3 w-80" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="bg-card shadow-sm ring-0">
              <CardContent>
                <Skeleton className="h-[13px] w-24 mb-2" />
                <Skeleton className="h-[28px] w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-[320px] w-full" />
      </CardContent>
    </Card>
  );
}
