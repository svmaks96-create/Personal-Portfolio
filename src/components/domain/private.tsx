import type { ReactNode } from "react";

export function Private({ children }: { children: ReactNode }) {
  return <span className="demo-mask">{children}</span>;
}
