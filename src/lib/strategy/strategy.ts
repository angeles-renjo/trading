import type { AppConfig } from "../config";
import type { Candle, TradePlan } from "../types";

// ---------------------------------------------------------------------------
// Pluggable strategy interface. The engine and backtester depend only on this,
// so switching trend-following ⇄ support/resistance is a config change.
// ---------------------------------------------------------------------------

/** Minimal open-trade context a strategy needs to manage a trailing stop. */
export interface PositionCtx {
  entryTime: number;
  entry: number;
  stop: number;
}

export interface Strategy {
  readonly name: string;
  /** Inspect the latest CLOSED candle for an entry. Pass candles up to (and
   *  including) the just-closed bar — no forming bar — to avoid lookahead. */
  evaluateEntry(candles: Candle[], cfg: AppConfig): TradePlan | null;
  /** Optional: return a tightened stop (>= current) for an open position, or
   *  null to leave it unchanged. Strategies with a fixed target omit this. */
  trailStop?(candles: Candle[], ctx: PositionCtx, cfg: AppConfig): number | null;
}
