/**
 * Engine 2 — quant factor pre-scoring of a screened universe.
 *
 * Pure. Plain `number` arithmetic is DELIBERATE here — this file computes
 * percentile statistics for ranking, not money math, so the decimal.js rule
 * does not apply (agreed exception; see docs/portfolio-construction.md §6).
 *
 * Method: per metric, percentile-rank 0–100 (higher = better; ranks are
 * outlier-immune by construction, so no winsorization), then each factor is
 * the mean of its available metric percentiles and the composite is the
 * equal-weight mean of available factors — renormalizing on nulls so a
 * missing metric never drags a name to zero. The COMPOSITE additionally
 * requires ≥3 of 4 factors present: a name scored on one or two factors is
 * on a different ruler and must not compete with fully-scored names.
 *
 * Sector treatment: VALUE and QUALITY metrics are ranked within the name's
 * sector (multiples and balance-sheet shape are structurally sector-driven —
 * universe-wide ranking makes the composite a permanent sector bet), falling
 * back to universe-wide ranks when the sector group is too small. GROWTH and
 * MOMENTUM stay universe-wide: an acceleration or a trend is comparable
 * across sectors. For Financial Services / Real Estate, EV/EBITDA and FCF
 * yield are accounting nonsense and are replaced by book yield (1/PB).
 */

/** Minimum non-null factors for a composite; below this it stays null. */
const MIN_FACTORS_FOR_COMPOSITE = 3;

/** Minimum non-null names in a sector before within-sector ranks apply. */
const MIN_SECTOR_GROUP = 10;

/** Sectors where EV/EBITDA and P/FCF are meaningless; value uses P/B instead. */
const FINANCIAL_SECTORS = new Set(["Financial Services", "Real Estate"]);

export interface QuantMetricsInput {
  ticker: string;
  /** FMP sector string — drives within-sector ranking; null ranks universe-wide. */
  sector: string | null;
  // Valuation multiples (inverted to yields internally).
  peTtm: number | null;
  fwdPe: number | null;
  pfcfTtm: number | null;
  evEbitdaTtm: number | null;
  psTtm: number | null;
  /** Price-to-book — value input for financial sectors only. */
  pbTtm: number | null;
  // Quality. ROIC (not ROE) — capital-structure-neutral, defined under
  // negative equity; income quality = CFO/NI, the accruals signal.
  roicTtm: number | null;
  netMarginTtm: number | null;
  debtToEquityTtm: number | null;
  incomeQualityTtm: number | null;
  // Growth: (NTM EPS − TTM EPS) / price — scale-free, defined for
  // loss-makers, no near-zero-denominator blowups…
  epsChangeYieldFwd: number | null;
  // …plus the cross-run estimate revision (same fiscal year, prior run
  // 21–120 days old); null until snapshot history exists.
  epsRevision: number | null;
  // Momentum: 12-minus-1 return, percent — the year's move excluding the
  // reversal-dominated last month. Same single input for EVERY name.
  priceChange12m1m: number | null;
}

export interface QuantScores {
  ticker: string;
  valueScore: number | null;
  growthScore: number | null;
  qualityScore: number | null;
  momentumScore: number | null;
  compositeScore: number | null;
}

/** 1 / multiple when the multiple is finite and non-zero; else null. */
function invert(multiple: number | null): number | null {
  if (multiple === null || multiple === 0 || !Number.isFinite(multiple)) {
    return null;
  }
  return 1 / multiple;
}

/**
 * Percentile-rank each non-null entry 0–100 (ties share the mean rank).
 * Nulls stay null. Rank-based, so outliers cannot stretch the scale — no
 * winsorization needed (ranks are invariant under monotone clamping).
 */
export function percentileRanks(
  values: (number | null)[],
): (number | null)[] {
  const sorted = values
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return values.map(() => null);

  return values.map((v) => {
    if (v === null) return null;
    if (n === 1) return 50;
    // Mean rank across ties: average of first and last index holding v.
    let first = 0;
    while (sorted[first] < v) first++;
    let last = first;
    while (last + 1 < n && sorted[last + 1] === v) last++;
    const meanRank = (first + last) / 2;
    return (meanRank / (n - 1)) * 100;
  });
}

/**
 * Rank each value against its SECTOR peers (0–100), falling back to the
 * universe-wide rank when the sector has fewer than `minGroup` non-null
 * entries (percentiles over tiny groups are noise) or the sector is null.
 */
export function sectorRelativePercentileRanks(
  values: (number | null)[],
  sectors: (string | null)[],
  minGroup = MIN_SECTOR_GROUP,
): (number | null)[] {
  const out = percentileRanks(values);
  const indicesBySector = new Map<string, number[]>();
  sectors.forEach((s, i) => {
    if (s === null) return;
    const list = indicesBySector.get(s);
    if (list) list.push(i);
    else indicesBySector.set(s, [i]);
  });
  for (const indices of indicesBySector.values()) {
    const subset = indices.map((i) => values[i]);
    const nonNull = subset.filter((v) => v !== null).length;
    if (nonNull < minGroup) continue;
    const ranks = percentileRanks(subset);
    indices.forEach((idx, j) => {
      out[idx] = ranks[j];
    });
  }
  return out;
}

/** Row-wise mean of available (non-null) entries; null when none available. */
function meanAvailable(rows: (number | null)[][]): (number | null)[] {
  const count = rows[0].length;
  const out: (number | null)[] = [];
  for (let i = 0; i < count; i++) {
    const vals = rows.map((r) => r[i]).filter((v): v is number => v !== null);
    out.push(
      vals.length === 0 ? null : vals.reduce((a, b) => a + b, 0) / vals.length,
    );
  }
  return out;
}

export function computeQuantScores(inputs: QuantMetricsInput[]): QuantScores[] {
  if (inputs.length === 0) return [];

  const sectors = inputs.map((c) => c.sector);
  const isFin = inputs.map(
    (c) => c.sector !== null && FINANCIAL_SECTORS.has(c.sector),
  );

  // Valuation — yields, so higher = cheaper = better; ranked vs sector peers.
  // Financial sectors: EV/EBITDA and FCF yield are nulled, book yield added.
  const earningsYield = sectorRelativePercentileRanks(
    inputs.map((c) => invert(c.fwdPe) ?? invert(c.peTtm)),
    sectors,
  );
  const fcfYield = sectorRelativePercentileRanks(
    inputs.map((c, i) => (isFin[i] ? null : invert(c.pfcfTtm))),
    sectors,
  );
  const ebitdaYield = sectorRelativePercentileRanks(
    inputs.map((c, i) => (isFin[i] ? null : invert(c.evEbitdaTtm))),
    sectors,
  );
  const salesYield = sectorRelativePercentileRanks(
    inputs.map((c) => invert(c.psTtm)),
    sectors,
  );
  const bookYield = sectorRelativePercentileRanks(
    // Negative P/B = negative equity — book yield is undefined, not "cheap".
    inputs.map((c, i) =>
      isFin[i] && c.pbTtm !== null && c.pbTtm > 0 ? invert(c.pbTtm) : null,
    ),
    sectors,
  );
  const valueScore = meanAvailable([
    earningsYield,
    fcfYield,
    ebitdaYield,
    salesYield,
    bookYield,
  ]);

  // Growth — universe-wide by design: EPS change yield + estimate revision.
  const changeYield = percentileRanks(
    inputs.map((c) => c.epsChangeYieldFwd),
  );
  const revision = percentileRanks(inputs.map((c) => c.epsRevision));
  const growthScore = meanAvailable([changeYield, revision]);

  // Quality — sector-relative. Leverage enters negated so lower D/E ranks
  // higher; NEGATIVE D/E or P/B means negative book equity, where D/E is
  // undefined (a negated negative would rank a gutted balance sheet as the
  // least levered name in the universe) — nulled, never ranked.
  const negEquity = inputs.map(
    (c) =>
      (c.debtToEquityTtm !== null && c.debtToEquityTtm < 0) ||
      (c.pbTtm !== null && c.pbTtm < 0),
  );
  const roic = sectorRelativePercentileRanks(
    inputs.map((c) => c.roicTtm),
    sectors,
  );
  const margin = sectorRelativePercentileRanks(
    inputs.map((c) => c.netMarginTtm),
    sectors,
  );
  const leverage = sectorRelativePercentileRanks(
    inputs.map((c, i) =>
      c.debtToEquityTtm === null || negEquity[i] ? null : -c.debtToEquityTtm,
    ),
    sectors,
  );
  const incomeQuality = sectorRelativePercentileRanks(
    inputs.map((c) => c.incomeQualityTtm),
    sectors,
  );
  const qualityScore = meanAvailable([roic, margin, leverage, incomeQuality]);

  // Momentum — the single 12-minus-1 input, universe-wide, identical for
  // every name (no local-history extras that would favor held names).
  const momentumScore = percentileRanks(
    inputs.map((c) => c.priceChange12m1m),
  );

  const factors = [valueScore, growthScore, qualityScore, momentumScore];
  const composite = meanAvailable(factors).map((mean, i) => {
    const available = factors.filter((f) => f[i] !== null).length;
    return available >= MIN_FACTORS_FOR_COMPOSITE ? mean : null;
  });

  return inputs.map((c, i) => ({
    ticker: c.ticker,
    valueScore: round2(valueScore[i]),
    growthScore: round2(growthScore[i]),
    qualityScore: round2(qualityScore[i]),
    momentumScore: round2(momentumScore[i]),
    compositeScore: round2(composite[i]),
  }));
}

function round2(v: number | null): number | null {
  return v === null ? null : Math.round(v * 100) / 100;
}

/**
 * 12-minus-1 momentum, percent: the trailing year's return with the last
 * month compounded OUT — (1+r₁ᵧ)/(1+r₁ₘ)−1 — because the most recent month
 * is dominated by short-term reversal. Null when either window is missing
 * or the 1M move is a total loss (denominator ≤ 0).
 */
export function momentum12m1m(
  change1y: number | null,
  change1m: number | null,
): number | null {
  if (change1y === null || change1m === null || change1m <= -100) return null;
  return ((1 + change1y / 100) / (1 + change1m / 100) - 1) * 100;
}

/**
 * Cross-run estimate revision: percent change in the FY1 EPS estimate vs a
 * prior run's snapshot. Null unless both snapshots target the SAME fiscal
 * year (a rolled-over fiscal year is a different estimate, not a revision)
 * and the prior estimate is non-zero. Sign-safe via |prior|.
 */
export function computeEpsRevision(
  current: { epsAvg: number; date: string } | null,
  prior: { epsAvg: number; date: string } | null,
): number | null {
  if (current === null || prior === null) return null;
  if (current.date !== prior.date) return null;
  if (prior.epsAvg === 0) return null;
  return (current.epsAvg - prior.epsAvg) / Math.abs(prior.epsAvg);
}
