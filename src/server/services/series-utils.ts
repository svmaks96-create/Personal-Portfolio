/**
 * Small statistics primitives shared by the analytics engines.
 *
 * Plain `number` throughout: these operate on already-computed USD amounts and
 * day counts where float precision is irrelevant, unlike the ledger arithmetic
 * in `computation.ts` which uses decimal.js because cents must reconcile.
 */

export function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Linear-interpolated quantile, p in [0, 1]. */
export function quantile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  if (values.length === 1) return values[0];
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function median(values: number[]): number | null {
  return quantile(values, 0.5);
}

/** Sample standard deviation (n-1). Null below two observations. */
export function stdevSample(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  let acc = 0;
  for (const v of values) acc += (v - m) ** 2;
  return Math.sqrt(acc / (values.length - 1));
}

export function sum(values: number[]): number {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export interface DistributionSummary {
  n: number;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
}

export function summarize(values: number[]): DistributionSummary {
  return {
    n: values.length,
    mean: mean(values),
    median: median(values),
    p25: quantile(values, 0.25),
    p75: quantile(values, 0.75),
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
  };
}

/** Mean weighted by a parallel array of non-negative weights. */
export function weightedMean(values: number[], weights: number[]): number | null {
  if (values.length === 0 || values.length !== weights.length) return null;
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i += 1) {
    const w = Math.max(0, weights[i]);
    num += values[i] * w;
    den += w;
  }
  return den === 0 ? null : num / den;
}

/** Population skewness (third standardized moment). Null below three points. */
export function skewness(values: number[]): number | null {
  if (values.length < 3) return null;
  const m = mean(values);
  if (m === null) return null;
  let m2 = 0;
  let m3 = 0;
  for (const v of values) {
    const d = v - m;
    m2 += d * d;
    m3 += d * d * d;
  }
  m2 /= values.length;
  m3 /= values.length;
  if (m2 === 0) return 0;
  return m3 / Math.pow(m2, 1.5);
}

/** Excess kurtosis (normal = 0). Null below four points. */
export function excessKurtosis(values: number[]): number | null {
  if (values.length < 4) return null;
  const m = mean(values);
  if (m === null) return null;
  let m2 = 0;
  let m4 = 0;
  for (const v of values) {
    const d = v - m;
    m2 += d * d;
    m4 += d * d * d * d;
  }
  m2 /= values.length;
  m4 /= values.length;
  if (m2 === 0) return 0;
  return m4 / (m2 * m2) - 3;
}

/** Pearson correlation. Null when either series is constant or too short. */
export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 2) return null;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  if (ma === null || mb === null) return null;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

export interface OlsResult {
  /** Slope — the beta when x is the benchmark's return series. */
  beta: number;
  /** Intercept, per period. */
  alpha: number;
  r2: number;
  correlation: number;
  n: number;
}

/** Ordinary least squares of `y` on `x`. Null when x has no variance. */
export function ols(y: number[], x: number[]): OlsResult | null {
  const n = Math.min(y.length, x.length);
  if (n < 2) return null;
  const my = mean(y.slice(0, n));
  const mx = mean(x.slice(0, n));
  if (my === null || mx === null) return null;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const beta = sxy / sxx;
  const correlation = syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
  return {
    beta,
    alpha: my - beta * mx,
    r2: correlation * correlation,
    correlation,
    n,
  };
}

export interface MannWhitneyResult {
  u: number;
  z: number | null;
  /** Two-sided p-value from the normal approximation with tie correction. */
  pValue: number | null;
  n1: number;
  n2: number;
}

/**
 * Mann-Whitney U with tie-corrected normal approximation.
 *
 * Used to ask whether losing positions are held longer than winning ones — the
 * disposition effect. Non-parametric because holding periods are heavily
 * right-skewed and a t-test would be misleading. At the sample sizes available
 * here the result is indicative, not conclusive; always report n alongside it.
 */
export function mannWhitneyU(a: number[], b: number[]): MannWhitneyResult {
  const n1 = a.length;
  const n2 = b.length;
  if (n1 === 0 || n2 === 0) return { u: 0, z: null, pValue: null, n1, n2 };

  const combined = [
    ...a.map((v) => ({ v, group: 0 })),
    ...b.map((v) => ({ v, group: 1 })),
  ].sort((x, y) => x.v - y.v);

  // Average ranks within ties, and accumulate the tie-correction term.
  const ranks = new Array<number>(combined.length);
  let tieTerm = 0;
  let i = 0;
  while (i < combined.length) {
    let j = i;
    while (j + 1 < combined.length && combined[j + 1].v === combined[i].v) j += 1;
    const avgRank = (i + j + 2) / 2; // ranks are 1-based
    for (let k = i; k <= j; k += 1) ranks[k] = avgRank;
    const t = j - i + 1;
    if (t > 1) tieTerm += t ** 3 - t;
    i = j + 1;
  }

  let rankSumA = 0;
  for (let k = 0; k < combined.length; k += 1) {
    if (combined[k].group === 0) rankSumA += ranks[k];
  }

  const u1 = rankSumA - (n1 * (n1 + 1)) / 2;
  const u2 = n1 * n2 - u1;
  const u = Math.min(u1, u2);

  const n = n1 + n2;
  const meanU = (n1 * n2) / 2;
  const varU =
    ((n1 * n2) / 12) * (n + 1 - tieTerm / (n * (n - 1)));
  if (varU <= 0) return { u, z: null, pValue: null, n1, n2 };

  // Continuity-corrected z.
  const z = (u - meanU + 0.5) / Math.sqrt(varU);
  return { u, z, pValue: 2 * normalCdf(-Math.abs(z)), n1, n2 };
}

/** Standard normal CDF via Abramowitz & Stegun 7.1.26. */
export function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}
