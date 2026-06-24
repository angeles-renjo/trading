import type { AppConfig } from "../config";
import type { Candle, TradePlan } from "../types";
import type { Strategy } from "./strategy";
import { detectSetup } from "./setup";
import { setupParamsFromConfig } from "./params";

// Support/resistance mean-reversion: buy a confirmed bounce off support, fixed
// stop below the zone and a fixed 2:1 target. No trailing (fixed target exit).
export class SRStrategy implements Strategy {
  readonly name = "sr";

  evaluateEntry(candles: Candle[], cfg: AppConfig): TradePlan | null {
    return detectSetup(candles, setupParamsFromConfig(cfg));
  }
}
