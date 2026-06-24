import type { Candle, Pivot } from "./types";

// ---------------------------------------------------------------------------
// Pure technical-analysis helpers. No external deps; fully unit-testable.
// ---------------------------------------------------------------------------

/**
 * Find swing pivots (fractals). A candle is a pivot high if its high is the
 * strict maximum over `left` bars before and `right` bars after it; likewise
 * for pivot lows. Bars without enough neighbours on either side are skipped.
 */
export function findPivots(
  candles: Candle[],
  left: number,
  right: number,
): Pivot[] {
  const pivots: Pivot[] = [];
  for (let i = left; i < candles.length - right; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) pivots.push({ time: c.time, price: c.high, kind: "high", index: i });
    if (isLow) pivots.push({ time: c.time, price: c.low, kind: "low", index: i });
  }
  return pivots;
}

/**
 * Wilder's Average True Range. Returns an array aligned to `candles` where
 * entries before enough data are `NaN`.
 */
export function atr(candles: Candle[], period = 14): number[] {
  const out: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < 2) return out;

  const trs: number[] = new Array(candles.length).fill(NaN);
  for (let i = 1; i < candles.length; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    trs[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose),
    );
  }

  // Seed with a simple average of the first `period` true ranges.
  if (candles.length <= period) return out;
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += trs[i];
  let prevAtr = sum / period;
  out[period] = prevAtr;
  for (let i = period + 1; i < candles.length; i++) {
    prevAtr = (prevAtr * (period - 1) + trs[i]) / period;
    out[i] = prevAtr;
  }
  return out;
}

/** Simple moving average aligned to the input (NaN until enough data). */
export function sma(values: number[], period: number): number[] {
  const out: number[] = new Array(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** True if `candle` is a bullish reaction candle (close in upper third, up bar). */
export function isBullishReaction(c: Candle): boolean {
  const range = c.high - c.low;
  if (range <= 0) return false;
  const closePosition = (c.close - c.low) / range; // 0 = at low, 1 = at high
  return c.close > c.open && closePosition >= 0.6;
}
