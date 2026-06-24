import type { AppConfig } from "../config";
import type { Candle, TradePlan, Zone } from "../types";
import { detectZones } from "./support-resistance";
import type { Strategy } from "./strategy";
import { SRStrategy } from "./sr-strategy";
import { TrendStrategy } from "./trend-strategy";

export * from "./support-resistance";
export * from "./setup";
export * from "./strategy";
export { setupParamsFromConfig } from "./params";

/** Resolve the configured strategy. */
export function getStrategy(cfg: AppConfig): Strategy {
  return cfg.strategy === "sr" ? new SRStrategy() : new TrendStrategy();
}

export interface Analysis {
  zones: Zone[];
  plan: TradePlan | null;
}

/**
 * One-shot analysis for the bot loop and dashboard. S/R zones are always
 * computed (useful chart context), and the active strategy supplies the plan.
 */
export function analyze(candles: Candle[], cfg: AppConfig): Analysis {
  const zones = detectZones(candles, {
    pivotLookback: cfg.pivotLookback,
    zoneWidthPct: cfg.zoneWidthPct,
    minTouches: cfg.minTouches,
  });
  const plan = getStrategy(cfg).evaluateEntry(candles, cfg);
  return { zones, plan };
}
