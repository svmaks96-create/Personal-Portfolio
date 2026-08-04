"use client";

import { useState, useRef } from "react";
import { RangeBar } from "@/components/domain/range-bar";
import { updatePriceLevels, setAddDownState } from "@/server/actions/theses";
import { formatCurrency } from "@/lib/formatting";
import { cn } from "@/lib/utils";
import type { PriceLevelsInput } from "@/shared/schemas/position-thesis";

interface PositionLevelsPanelProps {
  ticker: string;
  levels: {
    entryZoneLow: number | null;
    entryZoneHigh: number | null;
    entryNote: string | null;
    addLevel: number | null;
    addMaxSizePct: number | null;
    addNote: string | null;
    technicalBackstop: number | null;
    backstopNote: string | null;
  };
  addDownState: "available" | "used" | "void";
  technicalContext: string | null;
  range52w: { low: number | null; high: number | null };
  currentPrice: number | null;
}

interface LevelForm {
  entryZoneLow: string;
  entryZoneHigh: string;
  addLevel: string;
  addMaxSizePct: string;
  technicalBackstop: string;
  changeReason: string;
}

const s = (v: number | null): string => (v === null ? "" : String(v));
const toNum = (v: string): number | null => (v.trim() === "" ? null : Number(v));

const inputClasses =
  "w-full h-7 px-1.5 font-mono text-[12px] bg-card border border-line focus:border-foreground outline-none tabular-nums";

export function PositionLevelsPanel({
  ticker,
  levels,
  addDownState,
  technicalContext,
  range52w,
  currentPrice,
}: PositionLevelsPanelProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LevelForm>(() => ({
    entryZoneLow: s(levels.entryZoneLow),
    entryZoneHigh: s(levels.entryZoneHigh),
    addLevel: s(levels.addLevel),
    addMaxSizePct: s(levels.addMaxSizePct),
    technicalBackstop: s(levels.technicalBackstop),
    changeReason: "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [adReason, setAdReason] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const busyRef = useRef(false);

  function startEdit() {
    setForm({
      entryZoneLow: s(levels.entryZoneLow),
      entryZoneHigh: s(levels.entryZoneHigh),
      addLevel: s(levels.addLevel),
      addMaxSizePct: s(levels.addMaxSizePct),
      technicalBackstop: s(levels.technicalBackstop),
      changeReason: "",
    });
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setError(null);
    try {
      const next: PriceLevelsInput = {
        entryZoneLow: toNum(form.entryZoneLow),
        entryZoneHigh: toNum(form.entryZoneHigh),
        entryNote: levels.entryNote,
        addLevel: toNum(form.addLevel),
        addMaxSizePct: toNum(form.addMaxSizePct),
        addNote: levels.addNote,
        technicalBackstop: toNum(form.technicalBackstop),
        backstopNote: levels.backstopNote,
      };
      const result = await updatePriceLevels(ticker, next, form.changeReason);
      if (result.success) {
        setEditing(false);
      } else {
        setError(result.error);
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  async function handleAddDown(state: "used" | "void") {
    if (busyRef.current) return;
    busyRef.current = true;
    setIsBusy(true);
    setError(null);
    try {
      const result = await setAddDownState(ticker, state, adReason || undefined);
      if (!result.success) {
        setError(result.error);
      } else {
        setAdReason("");
      }
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  }

  const fmt = (v: number) => formatCurrency(v);

  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2 font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        <span>[ PRICE LEVELS ]</span>
        {!editing ? (
          <button
            type="button"
            onClick={startEdit}
            className="border border-line px-2 py-[2px] text-[9px] uppercase tracking-[0.16em] text-muted-foreground hover:text-foreground"
          >
            Edit levels
          </button>
        ) : (
          <span className="text-[9px] tracking-[0.16em]">New version on save</span>
        )}
      </div>

      <div className="space-y-4 px-3.5 py-3">
        <LevelRow
          label="Entry zone"
          note={levels.entryNote}
          value={
            levels.entryZoneLow !== null || levels.entryZoneHigh !== null
              ? `${levels.entryZoneLow === null ? "…" : fmt(levels.entryZoneLow)} – ${levels.entryZoneHigh === null ? "…" : fmt(levels.entryZoneHigh)}`
              : null
          }
          marker={levels.entryZoneHigh ?? levels.entryZoneLow}
          range52w={range52w}
          currentPrice={currentPrice}
        />
        <LevelRow
          label={`Add-down (${addDownState})`}
          note={levels.addNote}
          value={
            levels.addLevel === null
              ? null
              : `${fmt(levels.addLevel)}${levels.addMaxSizePct !== null ? ` · max ${levels.addMaxSizePct}%` : ""}`
          }
          marker={levels.addLevel}
          range52w={range52w}
          currentPrice={currentPrice}
          dimmed={addDownState !== "available"}
        />
        <LevelRow
          label="Technical backstop — review, never a sale"
          note={levels.backstopNote}
          value={
            levels.technicalBackstop === null
              ? null
              : fmt(levels.technicalBackstop)
          }
          marker={levels.technicalBackstop}
          range52w={range52w}
          currentPrice={currentPrice}
        />

        {technicalContext && (
          <div className="font-mono text-[10px] text-muted-foreground">
            {technicalContext}
          </div>
        )}

        {editing && (
          <div className="border-t border-line pt-3">
            <div className="grid grid-cols-5 gap-2">
              <EditField label="Entry low" value={form.entryZoneLow} onChange={(v) => setForm((f) => ({ ...f, entryZoneLow: v }))} />
              <EditField label="Entry high" value={form.entryZoneHigh} onChange={(v) => setForm((f) => ({ ...f, entryZoneHigh: v }))} />
              <EditField label="Add level" value={form.addLevel} onChange={(v) => setForm((f) => ({ ...f, addLevel: v }))} />
              <EditField label="Add max %" value={form.addMaxSizePct} onChange={(v) => setForm((f) => ({ ...f, addMaxSizePct: v }))} />
              <EditField label="Backstop" value={form.technicalBackstop} onChange={(v) => setForm((f) => ({ ...f, technicalBackstop: v }))} />
            </div>
            <div className="mt-2 flex items-end gap-2">
              <div className="flex-1">
                <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  Change reason (required)
                </span>
                <input
                  type="text"
                  className={cn(inputClasses, "mt-1")}
                  value={form.changeReason}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, changeReason: e.target.value }))
                  }
                />
              </div>
              <button
                type="button"
                disabled={isBusy}
                onClick={handleSave}
                className="border border-foreground bg-foreground px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
              >
                {isBusy ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setEditing(false)}
                className="border border-line bg-panel px-3 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground disabled:opacity-35"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {addDownState === "available" && levels.addLevel !== null && !editing && (
          <div className="flex items-center gap-2 border-t border-line pt-3">
            <input
              type="text"
              className={inputClasses}
              placeholder="Add-down note (fill price / bad-news reason)"
              value={adReason}
              onChange={(e) => setAdReason(e.target.value)}
            />
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleAddDown("used")}
              className="shrink-0 border border-line px-2.5 py-[5px] font-mono text-[9px] uppercase tracking-[0.16em] text-foreground hover:bg-panel-strong disabled:opacity-35"
            >
              Mark used
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={() => handleAddDown("void")}
              className="shrink-0 border border-neg px-2.5 py-[5px] font-mono text-[9px] uppercase tracking-[0.16em] text-neg hover:bg-panel-strong disabled:opacity-35"
            >
              Void
            </button>
          </div>
        )}

        {error && <div className="font-mono text-[11px] text-neg">{error}</div>}
      </div>
    </div>
  );
}

function LevelRow({
  label,
  value,
  note,
  marker,
  range52w,
  currentPrice,
  dimmed,
}: {
  label: string;
  value: string | null;
  note: string | null;
  marker: number | null;
  range52w: { low: number | null; high: number | null };
  currentPrice: number | null;
  dimmed?: boolean;
}) {
  return (
    <div className={cn(dimmed && "opacity-50")}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </span>
        <span className="font-mono text-[12px] text-foreground">
          {value ?? "—"}
        </span>
      </div>
      {marker !== null && (
        <div className="mt-1">
          <RangeBar
            low={range52w.low}
            high={range52w.high}
            current={marker}
            label={currentPrice !== null ? `now ${formatCurrency(currentPrice)}` : "52w"}
            formatValue={(v) => formatCurrency(v)}
          />
        </div>
      )}
      {note && (
        <div className="mt-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {note}
        </div>
      )}
    </div>
  );
}

function EditField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        className={cn(inputClasses, "mt-1")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
