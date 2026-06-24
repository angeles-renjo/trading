import type { AppConfig } from "../config";
import type { Candle, TradePlan, Zone } from "../types";
import { detectZones } from "./support-resistance";
import { detectSetup, type SetupParams } from "./setup";

export * from "./support-resistance";
export * from "./setup";

/** Build setup params from app config. */
export function setupParamsFromConfig(cfg: AppConfig): SetupParams {
  return {
    symbol: cfg.symbol,
    pivotLookback: cfg.pivotLookback,
    zoneWidthPct: cfg.zoneWidthPct,
    minTouches: cfg.minTouches,
    riskReward: cfg.riskReward,
    minStrengthAPlus: cfg.minStrengthAPlus,
    minStopPct: cfg.minStopPct,
  };
}

export interface Analysis {
  zones: Zone[];
  plan: TradePlan | null;
}

/** One-shot analysis used by the bot loop and the dashboard. */
export function analyze(candles: Candle[], cfg: AppConfig): Analysis {
  const zones = detectZones(candles, {
    pivotLookback: cfg.pivotLookback,
    zoneWidthPct: cfg.zoneWidthPct,
    minTouches: cfg.minTouches,
  });
  const plan = detectSetup(candles, setupParamsFromConfig(cfg));
  return { zones, plan };
}
