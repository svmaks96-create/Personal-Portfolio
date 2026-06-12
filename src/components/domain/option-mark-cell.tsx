"use client";

import { useState } from "react";
import { EditableCell } from "@/components/domain/editable-cell";
import { NumericCell } from "@/components/domain/numeric-cell";
import { Private } from "@/components/domain/private";
import { setOptionMark } from "@/server/actions/market-data";
import { formatPriceDate } from "@/lib/formatting";

interface OptionMarkCellProps {
  ticker: string;
  marketValue: { value: number | null; display: string };
  markDate: string | null;
}

/**
 * Market-value cell for option position rows. Click to set the current total
 * USD value (mark) of the open spreads. Shows the mark date when a fresh mark
 * applies, or "at cost" while the position is carried at cost basis.
 */
export function OptionMarkCell({
  ticker,
  marketValue,
  markDate,
}: OptionMarkCellProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(value: string | number) {
    const num = typeof value === "number" ? value : Number(value);
    const result = await setOptionMark(ticker, Number.isNaN(num) ? -1 : num);
    if (result.success) {
      setIsEditing(false);
      setError(null);
    } else {
      setError(result.error);
    }
  }

  return (
    <EditableCell
      rawValue={marketValue.value ?? ""}
      displayValue={marketValue.display}
      displayNode={
        <span className="tabular-nums">
          <Private>
            <NumericCell display={marketValue.display} />
          </Private>
          <span className="ml-1.5 text-[10px] text-muted-foreground">
            {markDate ? formatPriceDate(markDate) : "at cost"}
          </span>
        </span>
      }
      isEditing={isEditing}
      error={error}
      isHighlighted={false}
      inputType="number"
      onStartEdit={() => setIsEditing(true)}
      onSave={handleSave}
      onCancel={() => {
        setIsEditing(false);
        setError(null);
      }}
      onTabToNext={() => setIsEditing(false)}
    />
  );
}
