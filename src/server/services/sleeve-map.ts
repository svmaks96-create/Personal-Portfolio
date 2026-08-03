/**
 * Sleeve assignment for every ticker that has ever appeared in the ledger.
 *
 * This is a hand-maintained config rather than derived data, for two reasons.
 * `allocation_targets` has no bucket column, and `ticker_fundamentals.sector`
 * is useless here — every ETF comes back as "Financial Services", which would
 * put VTI, BND and VNQ in one bucket.
 *
 * The point of the split is to separate decisions of different kinds: the
 * passive core was never really a decision after the first buy, the bond and
 * income sleeves were a deliberate allocation that got unwound over five
 * years, and the single-stock book is where actual security selection happens.
 * Blending them produces a win rate that means nothing.
 */

export type Sleeve =
  | "Core Index"
  | "Bonds & Cash Proxy"
  | "Income & Defensive"
  | "Passive Satellite"
  | "Core Single Stock"
  | "Satellite Single Stock"
  | "UAE IPOs"
  | "Options";

/** Display order for roll-up tables: passive core first, most speculative last. */
export const SLEEVE_ORDER: Sleeve[] = [
  "Core Index",
  "Bonds & Cash Proxy",
  "Income & Defensive",
  "Passive Satellite",
  "Core Single Stock",
  "Satellite Single Stock",
  "UAE IPOs",
  "Options",
];

const SLEEVE_BY_TICKER: Record<string, Sleeve> = {
  // The passive core — bought continuously, never sold, 68% of NAV today.
  VTI: "Core Index",
  VXUS: "Core Index",

  // Fixed income and cash proxies. Fully exited: PDBC 2021, RSP/VWOB 2022,
  // VCSH 2025-02, BND/BNDX 2025-08.
  BND: "Bonds & Cash Proxy",
  BNDX: "Bonds & Cash Proxy",
  VCSH: "Bonds & Cash Proxy",
  VWOB: "Bonds & Cash Proxy",

  // Yield and low-beta equity. VPU is the only survivor; VIG was re-bought
  // Dec-2025 and sold again Apr-2026.
  VIG: "Income & Defensive",
  VPU: "Income & Defensive",
  VNQ: "Income & Defensive",
  VNQI: "Income & Defensive",

  // Factor, region and commodity tilts around the core — all exited.
  VEA: "Passive Satellite",
  VEU: "Passive Satellite",
  VWO: "Passive Satellite",
  RSP: "Passive Satellite",
  IAU: "Passive Satellite",
  PDBC: "Passive Satellite",
  ARTY: "Passive Satellite",
  MJ: "Passive Satellite",

  // Large-cap compounders held as intended long-term positions.
  MSFT: "Core Single Stock",
  AMZN: "Core Single Stock",
  META: "Core Single Stock",
  NVDA: "Core Single Stock",
  AVGO: "Core Single Stock",
  TSM: "Core Single Stock",
  ASML: "Core Single Stock",
  ADBE: "Core Single Stock",
  CRM: "Core Single Stock",
  QCOM: "Core Single Stock",
  MU: "Core Single Stock",
  MRVL: "Core Single Stock",
  BABA: "Core Single Stock",
  TSLA: "Core Single Stock",

  // Higher-variance single names: smaller sizing, shorter intended horizon.
  MNDY: "Satellite Single Stock",
  TEAM: "Satellite Single Stock",
  SNOW: "Satellite Single Stock",
  PTC: "Satellite Single Stock",
  RBRK: "Satellite Single Stock",
  CRWV: "Satellite Single Stock",
  KLAR: "Satellite Single Stock",
  FIG: "Satellite Single Stock",
  RDDT: "Satellite Single Stock",
  RXRX: "Satellite Single Stock",
  CPNG: "Satellite Single Stock",
  NU: "Satellite Single Stock",
  KSPI: "Satellite Single Stock",
  CEG: "Satellite Single Stock",
  XYZ: "Satellite Single Stock",
  ARM: "Satellite Single Stock",
  OS: "Satellite Single Stock",
  SPCX: "Satellite Single Stock",
  IQ: "Satellite Single Stock",
  TME: "Satellite Single Stock",
  MIR: "Satellite Single Stock",
  CIAN: "Satellite Single Stock",
  GDEV: "Satellite Single Stock",
  GDEVW: "Satellite Single Stock",
  FTCV: "Satellite Single Stock",

  // Local IPO subscriptions, all closed 2025-11-26. Priced from a manual CSV,
  // not FMP — their series stop dead on the exit date.
  "DFM:DTC": "UAE IPOs",
  "DFM:PARKIN": "UAE IPOs",
  "DFM:SPINNEYS": "UAE IPOs",
  "DFM:TALABAT": "UAE IPOs",
  "ADX:ALEFEDT": "UAE IPOs",
  "ADX:ALPHADATA": "UAE IPOs",
  "ADX:NMDCENR": "UAE IPOs",
};

/**
 * Throws on an unmapped ticker rather than bucketing it as "Other".
 * A silent fallback would let a newly bought name vanish from every roll-up
 * while the totals still balanced — the worst kind of reporting bug.
 */
export function sleeveOf(ticker: string, instrument: "stock" | "option"): Sleeve {
  if (instrument === "option") return "Options";
  const sleeve = SLEEVE_BY_TICKER[ticker];
  if (sleeve === undefined) {
    throw new Error(
      `sleeveOf: no sleeve mapped for ticker "${ticker}". Add it to SLEEVE_BY_TICKER in src/server/services/sleeve-map.ts.`
    );
  }
  return sleeve;
}

/** Non-throwing probe, for validating coverage before a run. */
export function hasSleeve(ticker: string): boolean {
  return ticker in SLEEVE_BY_TICKER;
}

/** Tickers present in the ledger that have no sleeve assigned. */
export function findUnmappedTickers(tickers: Iterable<string>): string[] {
  const missing = new Set<string>();
  for (const t of tickers) if (!hasSleeve(t)) missing.add(t);
  return [...missing].sort();
}
