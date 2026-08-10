"use client";

import { useState, useRef } from "react";
import { runScreen } from "@/server/actions/screening";
import {
  SCREENING_SECTORS,
  type ScreeningCriteria,
  type ScreeningSector,
} from "@/shared/schemas/screening";

const inputClasses =
  "w-full h-7 px-1.5 font-mono text-[12px] bg-card border border-line focus:border-foreground outline-none tabular-nums";

/** Band presets — the mcap band is the primary universe control. */
const BAND_PRESETS = [
  { label: "Mid $2–30B", floorB: "2", ceilingB: "30" },
  { label: "Large $30B+", floorB: "30", ceilingB: "" },
  { label: "All $2B+", floorB: "2", ceilingB: "" },
] as const;

interface ScreeningControlsProps {
  lastCriteria: ScreeningCriteria | null;
}

/**
 * Criteria band + floors + the Run button. runScreen is a LONG server action
 * (~4 FMP calls per name) — it only ever runs from this button, never on load.
 */
export function ScreeningControls({ lastCriteria }: ScreeningControlsProps) {
  const [floorBillions, setFloorBillions] = useState(
    String((lastCriteria?.marketCapMoreThan ?? 2_000_000_000) / 1e9),
  );
  const [ceilingBillions, setCeilingBillions] = useState(
    lastCriteria?.marketCapLowerThan != null
      ? String(lastCriteria.marketCapLowerThan / 1e9)
      : "",
  );
  const [volumeThousands, setVolumeThousands] = useState(
    String((lastCriteria?.volumeMoreThan ?? 500_000) / 1e3),
  );
  const [sector, setSector] = useState<ScreeningSector | "">(
    lastCriteria?.sector ?? "",
  );
  const [limit, setLimit] = useState(String(lastCriteria?.limit ?? 1000));
  const [isRunning, setIsRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runningRef = useRef(false);

  async function handleRun() {
    if (runningRef.current) return;
    runningRef.current = true;
    setIsRunning(true);
    setMessage(null);
    setWarning(null);
    setError(null);
    try {
      const result = await runScreen({
        marketCapMoreThan: Number(floorBillions) * 1e9,
        marketCapLowerThan:
          ceilingBillions.trim() === "" ? null : Number(ceilingBillions) * 1e9,
        volumeMoreThan: Number(volumeThousands) * 1e3,
        sector: sector === "" ? null : sector,
        limit: Number(limit),
      });
      if (result.success) {
        setMessage(
          `Run #${result.data.runId}: ${result.data.scored} scored · ${result.data.failed} failed`,
        );
        if (result.data.truncated) {
          setWarning(
            `Cap bound at ${limit} — smallest names above the floor were cut; narrow the band or raise the cap`,
          );
        }
      } else {
        setError(result.error);
      }
    } finally {
      runningRef.current = false;
      setIsRunning(false);
    }
  }

  return (
    <div className="border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line bg-panel-strong px-3.5 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
          Screen Criteria — US-listed incl. ADRs · non-ETF · actively trading
        </span>
        <span className="flex gap-1.5">
          {BAND_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={isRunning}
              onClick={() => {
                setFloorBillions(p.floorB);
                setCeilingBillions(p.ceilingB);
              }}
              className="border border-line px-2 py-[2px] font-mono text-[9px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground disabled:opacity-35"
            >
              {p.label}
            </button>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-4 px-3.5 py-3">
        <label className="block w-32">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Mkt cap ≥ ($B)
          </span>
          <input
            type="number"
            step="0.5"
            min="0"
            className={inputClasses + " mt-1"}
            value={floorBillions}
            onChange={(e) => setFloorBillions(e.target.value)}
          />
        </label>
        <label className="block w-32">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Mkt cap &lt; ($B)
          </span>
          <input
            type="number"
            step="0.5"
            min="0"
            placeholder="no ceiling"
            className={inputClasses + " mt-1"}
            value={ceilingBillions}
            onChange={(e) => setCeilingBillions(e.target.value)}
          />
        </label>
        <label className="block w-32">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Avg volume ≥ (K)
          </span>
          <input
            type="number"
            step="50"
            min="0"
            className={inputClasses + " mt-1"}
            value={volumeThousands}
            onChange={(e) => setVolumeThousands(e.target.value)}
          />
        </label>
        <label className="block w-44">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Sector
          </span>
          <select
            className={inputClasses + " mt-1"}
            value={sector}
            onChange={(e) => setSector(e.target.value as ScreeningSector | "")}
          >
            <option value="">All sectors</option>
            {SCREENING_SECTORS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block w-32">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
            Safety cap (≤1000)
          </span>
          <input
            type="number"
            step="50"
            min="1"
            max="1000"
            className={inputClasses + " mt-1"}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={isRunning}
          onClick={handleRun}
          className="border border-foreground bg-foreground px-4 py-[5px] font-mono text-[10px] uppercase tracking-[0.18em] text-background hover:opacity-90 disabled:opacity-35"
        >
          {isRunning ? "Running…" : "Run Screen"}
        </button>
        {message && (
          <span className="font-mono text-[11px] text-pos">{message}</span>
        )}
        {warning && (
          <span className="font-mono text-[11px] text-muted-foreground">
            ⚠ {warning}
          </span>
        )}
        {error && <span className="font-mono text-[11px] text-neg">{error}</span>}
      </div>
    </div>
  );
}
