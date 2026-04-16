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
    <nav className="flex gap-0 -mb-px">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={buildHref(tab.href)}
            className={`px-5 py-2.5 text-sm border-b-2 transition-colors ${
              active
                ? "border-foreground text-foreground font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
