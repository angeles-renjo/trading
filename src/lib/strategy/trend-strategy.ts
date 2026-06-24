import type { AppConfig } from "../config";
import type { Candle, SetupGrade, TradePlan } from "../types";
import type { Strategy, PositionCtx } from "./strategy";
import { atr, sma } from "../indicators";
import { roundPrice } from "../num";

// ---------------------------------------------------------------------------
// Trend-following / breakout (long-only, spot).
//
//   Entry : close breaks above the highest high of the prior `donchianN` bars,
//           AND the trend is up (close above a rising long MA).
//   Stop  : ATR-based — entry - atrMult * ATR (wide enough to survive noise,
//           so fees are a small fraction of risk).
//   Exit  : chandelier trailing stop — (highest high since entry) - atrMult*ATR.
//           No fixed target: let winners run.
// ---------------------------------------------------------------------------

const SLOPE_LOOKBACK = 10;

export class TrendStrategy implements Strategy {
  readonly name = "trend";

  evaluateEntry(candles: Candle[], cfg: AppConfig): TradePlan | null {
    const n = candles.length;
    const need = Math.max(cfg.trendMaPeriod + SLOPE_LOOKBACK, cfg.donchianN + 1, cfg.atrPeriod + 1);
    if (n < need) return null;

    const i = n - 1;
    const last = candles[i];
    const closes = candles.map((c) => c.close);
    const ma = sma(closes, cfg.trendMaPeriod);
    const atrArr = atr(candles, cfg.atrPeriod);

    const maNow = ma[i];
    const maPrev = ma[i - SLOPE_LOOKBACK];
    const a = atrArr[i];
    if (!Number.isFinite(maNow) || !Number.isFinite(maPrev) || !Number.isFinite(a) || a <= 0) {
      return null;
    }

    // Trend filter: price above a rising long MA.
    const rising = maNow > maPrev;
    const aboveMa = (last.close - maNow) / maNow;
    if (!rising || aboveMa <= 0) return null;

    // Breakout: close above the highest high of the prior donchianN bars.
    let priorHigh = -Infinity;
    for (let k = i - cfg.donchianN; k < i; k++) {
      if (k >= 0 && candles[k].high > priorHigh) priorHigh = candles[k].high;
    }
    if (!(last.close > priorHigh)) return null;

    const entry = roundPrice(last.close);
    let stop = roundPrice(entry - cfg.atrMult * a);
    const minStop = entry * (1 - cfg.minStopPct);
    if (stop > minStop) stop = roundPrice(minStop);
    const risk = entry - stop;
    if (risk <= 0) return null;

    const grade: SetupGrade = aboveMa > 0.03 ? "A+" : aboveMa > 0.01 ? "A" : "B";
    const reason =
      `Breakout above ${priorHigh.toFixed(0)} in an uptrend ` +
      `(${(aboveMa * 100).toFixed(1)}% over the ${cfg.trendMaPeriod}-bar MA); ` +
      `ATR(${cfg.atrPeriod}) stop ${cfg.atrMult}× → trailing.`;

    return {
      time: last.time,
      symbol: cfg.symbol,
      side: "long",
      grade,
      entry,
      stop,
      target: null, // trail instead of a fixed target
      riskReward: 0,
      reason,
      strategy: this.name,
    };
  }

  trailStop(candles: Candle[], ctx: PositionCtx, cfg: AppConfig): number | null {
    const n = candles.length;
    if (n === 0) return null;
    const a = atr(candles, cfg.atrPeriod)[n - 1];
    if (!Number.isFinite(a) || a <= 0) return null;

    let highestSinceEntry = -Infinity;
    for (const c of candles) {
      if (c.time >= ctx.entryTime && c.high > highestSinceEntry) highestSinceEntry = c.high;
    }
    if (highestSinceEntry === -Infinity) return null;

    return roundPrice(highestSinceEntry - cfg.atrMult * a);
  }
}
