/**
 * Volatility drag: the gap between arithmetic and geometric return,
 * ≈ σ²/2 per year. This is the bridge between risk reduction and compounding
 * — cutting volatility while holding expected return constant adds the drag
 * difference directly to the geometric growth rate.
 *
 * Presented as an *upper bound* on the benefit of de-risking: trimming
 * positions usually moves expected return too, and this module deliberately
 * has no return model to net the two. The genuinely free part is volatility
 * that comes from redundant exposure — the same bet held several times.
 */

export interface VolDragPoint {
  volPct: number;
  dragPct: number;
}

export interface VolDragReference {
  volPct: number;
  dragPct: number;
  /** Compounding gained per year by moving from current vol to this level. */
  savingsPct: number;
}

export interface VolDrag {
  currentVolPct: number;
  currentDragPct: number;
  /** Drag as a function of vol, for the curve. */
  curve: VolDragPoint[];
  /** Lower-vol reference levels, only those below current vol. */
  references: VolDragReference[];
}

export function dragPctFromVolPct(volPct: number): number {
  const vol = volPct / 100;
  return ((vol * vol) / 2) * 100;
}

const CURVE_MAX_VOL_PCT = 50;
const CURVE_STEP_PCT = 1;
const REFERENCE_VOLS_PCT = [30, 25, 20, 15, 10];

export function computeVolDrag(currentVolPct: number): VolDrag {
  const curve: VolDragPoint[] = [];
  for (let vol = 0; vol <= CURVE_MAX_VOL_PCT; vol += CURVE_STEP_PCT) {
    curve.push({ volPct: vol, dragPct: dragPctFromVolPct(vol) });
  }

  const currentDragPct = dragPctFromVolPct(currentVolPct);
  const references = REFERENCE_VOLS_PCT.filter((v) => v < currentVolPct).map(
    (volPct) => ({
      volPct,
      dragPct: dragPctFromVolPct(volPct),
      savingsPct: currentDragPct - dragPctFromVolPct(volPct),
    })
  );

  return { currentVolPct, currentDragPct, curve, references };
}
