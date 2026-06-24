// Small numeric helpers. Money/price math uses plain floats (fine for a paper
// engine and a tiny live account); we round consistently to avoid float dust.

export function round(n: number, dp: number): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Round a price. BTCUSDT trades to 2dp on Bybit spot; good enough generally. */
export function roundPrice(n: number, dp = 2): number {
  return round(n, dp);
}

/** Round a base-asset quantity (BTC supports plenty of precision). */
export function roundQty(n: number, dp = 6): number {
  return round(n, dp);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}
