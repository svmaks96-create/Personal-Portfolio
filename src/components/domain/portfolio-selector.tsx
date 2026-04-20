"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
}

export function PortfolioSelector({ portfolios }: PortfolioSelectorProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const selectedPortfolio = searchParams.get("portfolio");

  const items = [
    allItem,
    ...portfolios.map((p) => ({ value: p, label: p })),
  ];

  const currentValue = selectedPortfolio ?? ALL_PORTFOLIOS;

  function handleChange(value: string | null) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (!value || value === ALL_PORTFOLIOS) {
        params.delete("portfolio");
      } else {
        params.set("portfolio", value);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  }

  return (
    <Select value={currentValue} onValueChange={handleChange} items={items}>
      <SelectTrigger className="h-9 rounded-md border border-line bg-card px-3.5 text-[13px] font-medium text-foreground hover:bg-pill-bg">
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
