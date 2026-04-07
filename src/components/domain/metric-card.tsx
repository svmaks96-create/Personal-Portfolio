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
      ? "text-emerald-600"
      : variant === "pnl" && pnlDirection === "negative"
        ? "text-red-600"
        : "text-zinc-900";

  return (
    <Card className="bg-white shadow-sm ring-0">
      <CardContent>
        <p className="text-[13px] font-normal text-zinc-500">{label}</p>
        <p className={cn("text-[28px] font-bold", valueColor)}>{value}</p>
      </CardContent>
    </Card>
  );
}
