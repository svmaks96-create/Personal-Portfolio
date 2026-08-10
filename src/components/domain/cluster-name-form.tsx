"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveRiskClusterName } from "@/server/actions/risk-clusters";
import { cn } from "@/lib/utils";

interface ClusterNameFormProps {
  members: string[];
  currentName: string | null;
}

/** Inline rename for one cluster. Empty submission clears the label. */
export function ClusterNameForm({ members, currentName }: ClusterNameFormProps) {
  const router = useRouter();
  const [name, setName] = useState(currentName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (name === (currentName ?? "")) return;
    startTransition(async () => {
      const result = await saveRiskClusterName({ name, members });
      if (!result.success) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        type="text"
        value={name}
        placeholder="name this bet…"
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onBlur={submit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label={`Cluster name for ${members.join(", ")}`}
        className={cn(
          "w-40 border border-line bg-transparent px-1.5 py-0.5 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-foreground/40",
          isPending && "opacity-50"
        )}
      />
      {error ? (
        <span className="font-mono text-[9px] text-neg">{error}</span>
      ) : null}
    </div>
  );
}
