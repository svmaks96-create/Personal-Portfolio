import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface TerminalPanelProps {
  label: string;
  tag?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function TerminalPanel({
  label,
  tag,
  action,
  children,
  className,
  bodyClassName,
}: TerminalPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col border border-line bg-panel",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <div>
          [ {label} ]
          {tag ? <span className="ml-2 text-foreground">{tag}</span> : null}
        </div>
        {action}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col p-3.5", bodyClassName)}>
        {children}
      </div>
    </div>
  );
}
