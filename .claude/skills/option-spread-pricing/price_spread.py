"""Price long call debit spreads off an IBKR option-chain snapshot.

Usage:  python -I price_spread.py input.json
        (set PYTHONIOENCODING=utf-8 on Windows)

input.json:
{
  "symbol": "CRWV",
  "quote_spot": 61.39,          # spot the option quotes belong to (prior close if FROZEN)
  "live_spot": 65.24,
  "quote_date": "2026-10-16",   # date the option quotes were struck
  "today": "2026-10-19",
  "expiry": "2028-01-21",
  "rate_bey": 0.0453,           # Treasury yield interpolated to the tenor
  "calls": {"65": [21.15, 22.55], "100": [12.75, 13.05], ...},   # strike: [bid, ask]
  "puts":  {"60": [19.15, 19.5], "65": [22.1, 22.8]},            # near-spot, for parity
  "spreads": [[65, 100], [70, 110]],
  "pick": [65, 100],            # optional: spread for grid + ladder (default: first)
  "book": 430981, "cap_pct": 1.0, "fee_per_spread": 1.5,
  "spot_vol_beta": -0.5         # vol-pts per +1% spot move (assumption)
}
"""
import json
import sys
from datetime import date
from math import erf, exp, log, sqrt


def N(x):
    return 0.5 * (1 + erf(x / sqrt(2)))


def main(path):
    cfg = json.load(open(path))
    S0, S1 = cfg["quote_spot"], cfg["live_spot"]
    d = lambda s: date.fromisoformat(s)
    T0 = (d(cfg["expiry"]) - d(cfg["quote_date"])).days / 365
    T1 = (d(cfg["expiry"]) - d(cfg["today"])).days / 365
    r = 2 * log(1 + cfg["rate_bey"] / 2)
    calls = {float(k): v for k, v in cfg["calls"].items()}
    puts = {float(k): v for k, v in cfg.get("puts", {}).items()}
    beta = cfg.get("spot_vol_beta", -0.5)
    fee = cfg.get("fee_per_spread", 1.5)
    cap = cfg["book"] * cfg.get("cap_pct", 1.0) / 100

    def bs(S, K, v, T, q):
        d1 = (log(S / K) + (r - q + v * v / 2) * T) / (v * sqrt(T))
        return S * exp(-q * T) * N(d1) - K * exp(-r * T) * N(d1 - v * sqrt(T))

    def iv(S, K, p, T, q):
        lo, hi = 0.01, 4.0
        for _ in range(100):
            m = (lo + hi) / 2
            lo, hi = (lo, m) if bs(S, K, m, T, q) > p else (m, hi)
        return m

    mid = lambda ba: (ba[0] + ba[1]) / 2
    print(f"{cfg['symbol']}  quote spot {S0}  live {S1} ({(S1 / S0 - 1) * 100:+.1f}%)  "
          f"T={T1:.2f}y  r={r * 100:.2f}% cont")

    # 1. Borrow / dividend yield from put-call parity (near-spot strikes only:
    #    deep-ITM American puts carry early-exercise premium and bias q upward).
    DF = exp(-r * T0)
    qs = []
    for K, pba in puts.items():
        if K not in calls:
            continue
        seff = mid(calls[K]) - mid(pba) + K * DF
        q = -log(seff / S0) / T0
        print(f"  parity K={K:g}: implied S*e^-qT {seff:.2f} -> q {q * 100:+.2f}%/yr")
        if K <= S0 * 1.25:
            qs.append(q)
    q = sum(qs) / len(qs) if qs else 0.0
    print(f"  q used {q * 100:.2f}%/yr")

    # 2. Skew: quadratic in log-moneyness, weighted 1/spread^2 (tight quotes dominate).
    F0 = S0 * exp((r - q) * T0)
    pts = []
    for K, ba in calls.items():
        w = 1 / max(ba[1] - ba[0], 0.01) ** 2
        pts.append((log(K / F0), iv(S0, K, mid(ba), T0, q), w))
    A = [[0.0] * 4 for _ in range(3)]
    for x, y, w in pts:
        f = [1, x, x * x]
        for i in range(3):
            A[i][3] += w * f[i] * y
            for j in range(3):
                A[i][j] += w * f[i] * f[j]
    for i in range(3):
        p = max(range(i, 3), key=lambda k: abs(A[k][i]))
        A[i], A[p] = A[p], A[i]
        for k in range(3):
            if k != i:
                fct = A[k][i] / A[i][i]
                A[k] = [a - fct * b for a, b in zip(A[k], A[i])]
    c = [A[i][3] / A[i][i] for i in range(3)]
    skew = lambda x: c[0] + c[1] * x + c[2] * x * x
    print(f"  skew fit: ATMF vol {c[0] * 100:.1f}%, slope {c[1] * 100:.1f}")

    def vol(K, S, T, mode, dv):
        F = S * exp((r - q) * T)
        x = log(K / F0) if mode == "strike" else log(K / F)
        return skew(x) + dv

    def leg(S, K, T, mode="strike", dv=0.0):
        return bs(S, K, vol(K, S, T, mode, dv), T, q)

    def spread(lo, hi, S, T, mode="strike", dv=0.0):
        return leg(S, lo, T, mode, dv) - leg(S, hi, T, mode, dv)

    def theo(lo, hi, S=S1):
        """Average of three surface dynamics: sticky-strike, sticky-moneyness,
        sticky-strike with ATM vol moved by spot_vol_beta vol-pts per 1% spot move."""
        a = spread(lo, hi, S, T1, "strike")
        b = spread(lo, hi, S, T1, "moneyness")
        g = spread(lo, hi, S, T1, "strike", beta * (S / S0 - 1))
        return (a + b + g) / 3, a, b, g

    print("\n  strike  bid/ask         raw IV  smooth  fair@live")
    for K, ba in sorted(calls.items()):
        x = log(K / F0)
        print(f"  {K:6g}  {ba[0]:7.2f}/{ba[1]:<7.2f} {iv(S0, K, mid(ba), T0, q) * 100:5.1f}%  "
              f"{skew(x) * 100:5.1f}%  {leg(S1, K, T1):8.2f}")

    print("\n  spread    theo  (strike/money/beta)     width  max   R:R  BE      BE%  "
          "P>BE  Pmax  delta  vega/pt  n@cap  cost")
    for lo, hi in cfg["spreads"]:
        t, a, b, g = theo(lo, hi)
        w = hi - lo
        be = lo + t
        v = skew(log(be / (S1 * exp((r - q) * T1))))
        pbe = N((log(S1 / be) + (r - q - v * v / 2) * T1) / (v * sqrt(T1)))
        vh = skew(log(hi / (S1 * exp((r - q) * T1))))
        pmax = N((log(S1 / hi) + (r - q - vh * vh / 2) * T1) / (vh * sqrt(T1)))
        h = 0.01 * S1
        dlt = (spread(lo, hi, S1 + h, T1) - spread(lo, hi, S1 - h, T1)) / (2 * h)
        vg = (spread(lo, hi, S1, T1, dv=0.01) - spread(lo, hi, S1, T1, dv=-0.01)) / 2
        n = int(cap // (t * 100 + fee))
        print(f"  {lo:g}/{hi:<6g} {t:6.2f} ({a:.2f}/{b:.2f}/{g:.2f})  {w:5g} {w - t:6.2f} "
              f"{(w - t) / t:4.1f}x {be:7.2f} {be / S1 * 100 - 100:+4.0f}%  {pbe:.2f}  {pmax:.2f}  "
              f"{dlt:.3f}  {vg:+.3f}   {n:3d}  {n * (t * 100 + fee):,.0f}")

    lo, hi = cfg.get("pick", cfg["spreads"][0])
    t = theo(lo, hi)[0]
    h = 0.01 * S1
    dlt = (spread(lo, hi, S1 + h, T1) - spread(lo, hi, S1 - h, T1)) / (2 * h)
    vg = (spread(lo, hi, S1, T1, dv=0.01) - spread(lo, hi, S1, T1, dv=-0.01)) / 2
    th = spread(lo, hi, S1, T1 - 1 / 365) - spread(lo, hi, S1, T1)
    print(f"\n  PICK {lo:g}/{hi:g}: theo {t:.2f}  delta {dlt:.3f}  vega {vg:+.3f}/pt  "
          f"theta {th:+.4f}/day")
    print("  grid (sticky-strike) spot x parallel vol shift:")
    print("     spot    -5vol  -2vol    0   +2vol  +5vol")
    for m in (-0.05, -0.025, 0, 0.025, 0.05):
        S = S1 * (1 + m)
        print(f"  {S:8.2f} " + " ".join(f"{spread(lo, hi, S, T1, dv=dv / 100):6.2f}"
                                         for dv in (-5, -2, 0, 2, 5)))
    edge = 0.025 * t
    print(f"  ladder (start = theo - {edge:.2f}, ceiling = theo; step up every 2-3 min):")
    print("     spot    start  ceiling")
    for m in (-0.05, -0.03, -0.015, 0, 0.015, 0.03, 0.05):
        S = S1 * (1 + m)
        ts = theo(lo, hi, S)[0]
        print(f"  {S:8.2f}  {ts - edge:6.2f}  {ts:6.2f}")
    print("  ceiling vega adj: lower ceiling by |vega| per vol-pt live IV sits above the fit")


if __name__ == "__main__":
    main(sys.argv[1])
