"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_PORTFOLIOS = "__all__";

const allItem = { value: ALL_PORTFOLIOS, label: "All Portfolios" };

interface PortfolioSelectorProps {
  portfolios: string[];
  selectedPortfolio: string | undefined;
}

export function PortfolioSelector({
  portfolios,
  selectedPortfolio,
}: PortfolioSelectorProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const items = [
    allItem,
    ...portfolios.map((p) => ({ value: p, label: p })),
  ];

  const currentValue = selectedPortfolio ?? ALL_PORTFOLIOS;

  function handleChange(value: string | null) {
    startTransition(() => {
      if (!value || value === ALL_PORTFOLIOS) {
        router.push("/");
      } else {
        router.push(`/?portfolio=${encodeURIComponent(value)}`);
      }
    });
  }

  return (
    <Select value={currentValue} onValueChange={handleChange} items={items}>
      <SelectTrigger>
        <SelectValue placeholder="All Portfolios" />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
