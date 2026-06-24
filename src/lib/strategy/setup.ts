import type { Candle, TradePlan, SetupGrade, Zone } from "../types";
import { isBullishReaction } from "../indicators";
import {
  detectZones,
  nearestSupportBelow,
  nearestResistanceAbove,
  type ZoneOptions,
} from "./support-resistance";
import { roundPrice, round } from "../num";

// ---------------------------------------------------------------------------
// Setup detection: turn the current candle + S/R zones into an actionable,
// graded long trade plan. Spot, long-only — buy a confirmed bounce off a
// support zone, stop just below it, target at the configured reward:risk
// (capped by the next resistance ceiling).
// ---------------------------------------------------------------------------

export interface SetupParams extends ZoneOptions {
  symbol: string;
  /** Target reward:risk (2 = 2:1). */
  riskReward: number;
  /** Strength (0..100) required for an A+ grade. */
  minStrengthAPlus: number;
  /** Stop is placed this fraction below the support zone low. */
  stopBufferPct?: number;
  /** Minimum stop distance as a fraction of entry (noise floor). */
  minStopPct?: number;
}

const GRADE_ORDER: Record<SetupGrade, number> = { "A+": 3, A: 2, B: 1 };

export function gradeAtLeast(grade: SetupGrade, min: SetupGrade): boolean {
  return GRADE_ORDER[grade] >= GRADE_ORDER[min];
}

/**
 * Inspect the LAST candle in `candles` for a long setup. Pass only candles up
 * to (and including) the just-closed bar to avoid lookahead.
 */
export function detectSetup(candles: Candle[], p: SetupParams): TradePlan | null {
  if (candles.length < p.pivotLookback * 2 + 3) return null;

  const zones = detectZones(candles, {
    pivotLookback: p.pivotLookback,
    zoneWidthPct: p.zoneWidthPct,
    minTouches: p.minTouches,
  });
  if (zones.length === 0) return null;

  const last = candles[candles.length - 1];
  const price = last.close;

  const support = nearestSupportBelow(zones, price);
  if (!support) return null;

  // Reaction test: the candle must have dipped into the support zone and
  // closed back above its middle with bullish intent (covers both fresh
  // support bounces and break-and-retest of former resistance).
  const wickedIntoZone = last.low <= support.upper;
  const closedBackAbove = last.close > support.center;
  if (!wickedIntoZone || !closedBackAbove || !isBullishReaction(last)) {
    return null;
  }

  const stopBufferPct = p.stopBufferPct ?? 0.0015;
  const minStopPct = p.minStopPct ?? 0.005;

  const entry = roundPrice(price);
  let stop = roundPrice(support.lower * (1 - stopBufferPct));
  // Enforce a noise floor on the stop distance.
  const minStop = entry * (1 - minStopPct);
  if (stop > minStop) stop = roundPrice(minStop);

  const risk = entry - stop;
  if (risk <= 0) return null;

  // Profit ceiling: next resistance above. Open sky if none.
  const resistance: Zone | null = nearestResistanceAbove(zones, price);
  const ceiling = resistance ? resistance.center : Infinity;
  const room = ceiling - entry;
  const roomRR = room / risk;

  // Not enough headroom to the next ceiling to make the reward:risk → skip.
  if (roomRR < p.riskReward) return null;

  const target = roundPrice(entry + p.riskReward * risk);
  const rr = round((target - entry) / risk, 2);

  const grade = gradeSetup(support, p.minStrengthAPlus);

  const reason = buildReason(support, resistance, rr);

  return {
    time: last.time,
    symbol: p.symbol,
    side: "long",
    grade,
    entry,
    stop,
    target,
    riskReward: rr,
    reason,
    strategy: "sr",
    zone: support,
  };
}

function gradeSetup(support: Zone, minStrengthAPlus: number): SetupGrade {
  if (support.strength >= minStrengthAPlus && support.touches >= 3) return "A+";
  if (support.strength >= 50 && support.touches >= 2) return "A";
  return "B";
}

function buildReason(support: Zone, resistance: Zone | null, rr: number): string {
  const parts = [
    `Bullish reaction at support ${support.lower}–${support.upper}`,
    `(${support.touches} touches, strength ${support.strength})`,
  ];
  if (resistance) {
    parts.push(`headroom to resistance ~${resistance.center}`);
  } else {
    parts.push(`open sky above (no nearby resistance)`);
  }
  parts.push(`→ ${rr}:1 reward:risk`);
  return parts.join(" ");
}
