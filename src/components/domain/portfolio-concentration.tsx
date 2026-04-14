import { getConcentrationData } from "@/server/queries/dashboard";
import { ConcentrationChart } from "@/components/domain/concentration-chart";

interface PortfolioConcentrationProps {
  portfolio?: string;
}

export async function PortfolioConcentration({
  portfolio,
}: PortfolioConcentrationProps) {
  const data = getConcentrationData(portfolio);
  return <ConcentrationChart data={data} />;
}
