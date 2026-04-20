"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const tabs = [
  { label: "Dashboard", href: "/" },
  { label: "Positions", href: "/positions" },
  { label: "Transactions", href: "/transactions" },
  { label: "Import", href: "/import" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/transactions") return pathname.startsWith("/transactions");
  return pathname === href;
}

export function AppNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const portfolio = searchParams.get("portfolio");

  function buildHref(href: string): string {
    if (portfolio) {
      return `${href}?portfolio=${encodeURIComponent(portfolio)}`;
    }
    return href;
  }

  return (
    <nav className="flex gap-1">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={buildHref(tab.href)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors ${
              active
                ? "bg-pill-bg text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
