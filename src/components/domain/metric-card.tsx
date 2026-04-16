import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  variant?: "default" | "pnl";
  pnlDirection?: "positive" | "negative" | null;
}

export function MetricCard({
  label,
  value,
  variant = "default",
  pnlDirection = null,
}: MetricCardProps) {
  const valueColor =
    variant === "pnl" && pnlDirection === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : variant === "pnl" && pnlDirection === "negative"
        ? "text-red-600 dark:text-red-400"
        : "text-card-foreground";

  return (
    <Card className="bg-card shadow-sm ring-0">
      <CardContent>
        <p className="text-[13px] font-normal text-muted-foreground">{label}</p>
        <p className={cn("text-[28px] font-bold", valueColor)}>{value}</p>
      </CardContent>
    </Card>
  );
}
