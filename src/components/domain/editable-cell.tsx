"use client";

import { useRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface EditableCellProps {
  transactionId: number;
  field: string;
  rawValue: string | number;
  displayValue: string;
  isEditing: boolean;
  error: string | null;
  isHighlighted: boolean;
  inputType: "text" | "number" | "date" | "select";
  selectOptions?: string[];
  onStartEdit: () => void;
  onSave: (value: string | number) => void;
  onCancel: () => void;
  onTabToNext: () => void;
}

export function EditableCell({
  rawValue,
  displayValue,
  isEditing,
  error,
  isHighlighted,
  inputType,
  selectOptions,
  onStartEdit,
  onSave,
  onCancel,
  onTabToNext,
}: EditableCellProps) {
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const [localValue, setLocalValue] = useState(String(rawValue));
  const [prevEditing, setPrevEditing] = useState(false);

  if (isEditing && !prevEditing) {
    setLocalValue(String(rawValue));
  }
  if (isEditing !== prevEditing) {
    setPrevEditing(isEditing);
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      if ("select" in inputRef.current && inputType !== "select") {
        (inputRef.current as HTMLInputElement).select();
      }
    }
  }, [isEditing, inputType]);

  function commitSave() {
    let parsed: string | number = localValue;
    if (inputType === "number") {
      const num = Number(localValue);
      parsed = isNaN(num) ? localValue : num;
    }
    onSave(parsed);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitSave();
    } else if (e.key === "Tab") {
      e.preventDefault();
      commitSave();
      onTabToNext();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  }

  if (!isEditing) {
    return (
      <div
        className={cn(
          "cursor-pointer px-1 -mx-1 rounded transition-colors duration-700",
          isHighlighted && "bg-green-50",
        )}
        onClick={onStartEdit}
      >
        {displayValue}
        {error && <span className="block text-red-500 text-xs">{error}</span>}
      </div>
    );
  }

  const inputClasses =
    "w-full h-7 px-1 text-[14px] bg-white rounded ring-1 ring-zinc-900 outline-none";

  if (inputType === "select") {
    return (
      <div>
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          className={inputClasses}
          value={localValue}
          onChange={(e) => setLocalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitSave}
        >
          {selectOptions?.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {error && <span className="block text-red-500 text-xs">{error}</span>}
      </div>
    );
  }

  return (
    <div>
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={inputType}
        className={cn(inputClasses, "tabular-nums")}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commitSave}
      />
      {error && <span className="block text-red-500 text-xs">{error}</span>}
    </div>
  );
}
