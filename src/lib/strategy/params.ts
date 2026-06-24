import type { AppConfig } from "../config";
import type { SetupParams } from "./setup";

/** Build S/R setup params from app config. (Separate module to avoid import
 *  cycles between the strategy registry and the individual strategies.) */
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
