"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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

  return (
    <nav className="flex gap-0 -mb-px">
      {tabs.map((tab) => {
        const active = isActive(pathname, tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`px-5 py-2.5 text-sm border-b-2 transition-colors ${
              active
                ? "border-zinc-900 text-zinc-900 font-medium"
                : "border-transparent text-zinc-500 hover:text-zinc-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
