import { TerminalPanel } from "@/components/domain/terminal-panel";
import { formatDate, formatInteger } from "@/lib/formatting";

interface PositionProfilePanelProps {
  description: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  employees: number | null;
  ipoDate: string | null;
  ceo: string | null;
  website: string | null;
}

export function PositionProfilePanel({
  description,
  sector,
  industry,
  country,
  employees,
  ipoDate,
  ceo,
  website,
}: PositionProfilePanelProps) {
  const meta: { key: string; value: string | null }[] = [
    { key: "Sector", value: sector },
    { key: "Industry", value: industry },
    { key: "Country", value: country },
    { key: "Employees", value: employees === null ? null : formatInteger(employees) },
    { key: "IPO date", value: ipoDate ? formatDate(ipoDate) : null },
    { key: "CEO", value: ceo },
  ];

  const hasAny = description !== null || meta.some((m) => m.value !== null);

  return (
    <TerminalPanel label="PROFILE" className="flex-1">
      {hasAny ? (
        <div className="space-y-4">
          {description && (
            <p className="line-clamp-6 font-mono text-[12px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-6">
            {meta.map((m) => (
              <div
                key={m.key}
                className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1.5 font-mono text-[12px]"
              >
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                  {m.key}
                </span>
                <span className="text-right text-foreground">
                  {m.value ?? "N/A"}
                </span>
              </div>
            ))}
          </div>
          {website && (
            <a
              href={website}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-[11px] text-foreground underline decoration-line-soft underline-offset-2 hover:decoration-foreground"
            >
              {website.replace(/^https?:\/\//, "")}
            </a>
          )}
        </div>
      ) : (
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          No profile data
        </p>
      )}
    </TerminalPanel>
  );
}
