import type { Candle, Pivot, Zone } from "../types";
import { findPivots } from "../indicators";
import { clamp, round } from "../num";

// ---------------------------------------------------------------------------
// Support/Resistance zone detection.
//
// Pivots (swing highs and lows) are clustered by price proximity into zones.
// A zone's role (support vs resistance) is decided RELATIVE to a reference
// price, so a broken resistance that price now sits above is correctly treated
// as support (role reversal) — the basis of break-and-retest setups.
//
// Important for backtesting: only pass candles up to the bar being evaluated.
// findPivots requires `right` confirming bars, so pivots near the end aren't
// returned until confirmed — no lookahead.
// ---------------------------------------------------------------------------

export interface ZoneOptions {
  pivotLookback: number;
  /** Half-width of a zone as a fraction of price (0.006 = ±0.6%). */
  zoneWidthPct: number;
  minTouches: number;
}

interface Cluster {
  pivots: Pivot[];
  center: number;
}

/**
 * Detect S/R zones from a candle series and classify each relative to the
 * series' last close. Returns zones sorted by center (ascending), keeping only
 * those with at least `minTouches` touches.
 */
export function detectZones(candles: Candle[], opts: ZoneOptions): Zone[] {
  if (candles.length < opts.pivotLookback * 2 + 1) return [];

  const pivots = findPivots(candles, opts.pivotLookback, opts.pivotLookback);
  if (pivots.length === 0) return [];

  // Greedy proximity clustering over price-sorted pivots.
  const sorted = [...pivots].sort((a, b) => a.price - b.price);
  const clusters: Cluster[] = [];
  for (const p of sorted) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p.price - last.center) <= last.center * opts.zoneWidthPct) {
      last.pivots.push(p);
      // running mean keeps the cluster centred on its members
      last.center =
        last.pivots.reduce((s, x) => s + x.price, 0) / last.pivots.length;
    } else {
      clusters.push({ pivots: [p], center: p.price });
    }
  }

  const refPrice = candles[candles.length - 1].close;
  const lastIndex = candles.length - 1;

  const zones: Zone[] = clusters
    .filter((c) => c.pivots.length >= opts.minTouches)
    .map((c) => {
      const prices = c.pivots.map((p) => p.price);
      const lower = Math.min(...prices);
      const upper = Math.max(...prices);
      const center = c.center;
      const touches = c.pivots.length;
      const lastTouchIndex = Math.max(...c.pivots.map((p) => p.index));
      const lastTouchTime = Math.max(...c.pivots.map((p) => p.time));

      const touchScore = clamp(touches / 5, 0, 1);
      const recencyScore = lastIndex > 0 ? lastTouchIndex / lastIndex : 0;
      const strength = Math.round(100 * (0.65 * touchScore + 0.35 * recencyScore));

      const zone: Zone = {
        kind: center <= refPrice ? "support" : "resistance",
        lower: round(lower, 2),
        upper: round(upper, 2),
        center: round(center, 2),
        touches,
        strength,
        lastTouchTime,
      };
      return zone;
    })
    .sort((a, b) => a.center - b.center);

  return zones;
}

/** Nearest support zone at or below `price` (the one we might bounce from). */
export function nearestSupportBelow(zones: Zone[], price: number): Zone | null {
  let best: Zone | null = null;
  for (const z of zones) {
    if (z.center <= price) {
      if (!best || z.center > best.center) best = z;
    }
  }
  return best;
}

/** Nearest resistance zone strictly above `price` (our profit ceiling). */
export function nearestResistanceAbove(zones: Zone[], price: number): Zone | null {
  for (const z of zones) {
    if (z.center > price) return z; // zones are sorted ascending
  }
  return null;
}
