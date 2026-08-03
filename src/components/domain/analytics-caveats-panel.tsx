import { getAnalyticsPageData } from "@/server/queries/analytics-page";
import { TerminalPanel } from "@/components/domain/terminal-panel";

interface AnalyticsCaveatsPanelProps {
  portfolio?: string;
}

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2 } as const;

function severityClass(severity: "critical" | "high" | "medium"): string {
  if (severity === "critical") return "text-neg";
  if (severity === "high") return "text-[var(--warn)]";
  return "text-muted-foreground";
}

/**
 * Rendered at the top of the page rather than buried at the bottom.
 *
 * Two of these are large enough to change what the headline numbers mean —
 * untracked cash and the price-return convention — so putting them after the
 * charts would be a way of not really disclosing them.
 */
export async function AnalyticsCaveatsPanel({ portfolio }: AnalyticsCaveatsPanelProps) {
  const data = getAnalyticsPageData(portfolio);
  const caveats = [...data.caveats].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  const criticalCount = caveats.filter((c) => c.severity === "critical").length;

  return (
    <TerminalPanel
      label="READ THIS FIRST"
      tag={`${caveats.length} CAVEATS · ${criticalCount} CRITICAL`}
    >
      <ul className="space-y-2">
        {caveats.map((caveat) => (
          <li key={caveat.text} className="flex gap-2.5 font-mono text-[10px] leading-relaxed">
            <span
              className={`shrink-0 uppercase tracking-[0.14em] ${severityClass(caveat.severity)}`}
            >
              {caveat.severity}
            </span>
            <span className="text-muted-foreground">{caveat.text}</span>
          </li>
        ))}
      </ul>
    </TerminalPanel>
  );
}
