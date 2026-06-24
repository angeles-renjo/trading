import "../src/lib/load-env";
import { getConfig } from "../src/lib/config";
import { getMarketData, intervalToSeconds } from "../src/lib/exchange";
import {
  getStrategy,
  detectZones,
  nearestSupportBelow,
  nearestResistanceAbove,
} from "../src/lib/strategy";
import { sizePosition } from "../src/lib/trading/risk";
import { sma } from "../src/lib/indicators";
import { fmtUsd, fmtPct, fmtNum, fmtDateTime, toNzd } from "../src/lib/format";

// "What's the trade right now?" — fetches live candles, runs the strategy on the
// latest CLOSED bar, and prints the current entry / stop / target (read-only, no
// orders). Optionally pass your account balance (USDT) to size the position:
//   npm run signal -- 60
//   npx tsx scripts/signal.ts 60

const SLOPE_LOOKBACK = 10;

async function main() {
  const cfg = getConfig();
  const argv = process.argv.slice(2);
  const balArg = argv.find((a) => /^\d+(\.\d+)?$/.test(a));
  const balance = balArg ? Number(balArg) : cfg.startingBalance;
  const interval = cfg.primaryInterval;

  const md = getMarketData();
  const [ticker, raw] = await Promise.all([
    md.getTicker(cfg.symbol),
    md.getHistory(cfg.symbol, interval, 400),
  ]);

  // Only reason about closed candles.
  const step = intervalToSeconds(interval);
  const now = Math.floor(Date.now() / 1000);
  const candles =
    raw.length && raw[raw.length - 1].time + step > now ? raw.slice(0, -1) : raw;
  if (candles.length < 60) {
    console.error(`Not enough candles (${candles.length}). Is the data source reachable?`);
    process.exit(1);
  }
  const last = candles[candles.length - 1];

  console.log("Crypto Trading Partner — Live Signal\n" + "=".repeat(56));
  console.log(`Symbol      ${cfg.symbol}        Price   ${fmtUsd(ticker.last)}`);
  console.log(`Timeframe   ${interval}            Strategy ${cfg.strategy}`);
  console.log(`As of       ${fmtDateTime(last.time)}  (last closed candle)`);
  console.log(`Account     ${fmtUsd(balance)}  (≈ ${fmtNum(toNzd(balance, cfg.nzdPerUsd))} NZD), risk ${fmtPct(cfg.riskPerTrade, 1)}/trade`);
  console.log("-".repeat(56));

  // Trend context (the regime filter the strategy uses).
  const closes = candles.map((c) => c.close);
  const maArr = sma(closes, cfg.trendMaPeriod);
  const ma = maArr[maArr.length - 1];
  const maPrev = maArr[maArr.length - 1 - SLOPE_LOOKBACK];
  if (Number.isFinite(ma) && Number.isFinite(maPrev)) {
    const aboveMa = last.close > ma;
    const rising = ma > maPrev;
    const up = aboveMa && rising;
    console.log(`Trend       ${up ? "UP ▲ — longs allowed" : "NOT an uptrend — longs blocked"}`);
    console.log(
      `            price ${fmtPct((last.close - ma) / ma)} ${aboveMa ? "above" : "below"} the ${cfg.trendMaPeriod}-bar MA (${fmtUsd(ma)}); MA ${rising ? "rising" : "falling"}`,
    );
  }

  // Breakout level the strategy is watching.
  let priorHigh = -Infinity;
  for (let k = candles.length - 1 - cfg.donchianN; k < candles.length - 1; k++) {
    if (k >= 0 && candles[k].high > priorHigh) priorHigh = candles[k].high;
  }
  if (priorHigh > 0) {
    console.log(
      `Breakout    ${fmtUsd(priorHigh)}  — needs a ${interval} close above this (${fmtPct((priorHigh - last.close) / last.close)} away)`,
    );
  }

  // Nearest S/R for context.
  const zones = detectZones(candles, {
    pivotLookback: cfg.pivotLookback,
    zoneWidthPct: cfg.zoneWidthPct,
    minTouches: cfg.minTouches,
  });
  const sup = nearestSupportBelow(zones, last.close);
  const res = nearestResistanceAbove(zones, last.close);
  console.log(
    `Support     ${sup ? fmtUsd(sup.center) : "—"}        Resistance ${res ? fmtUsd(res.center) : "—"}`,
  );
  console.log("-".repeat(56));

  // The actual signal.
  const plan = getStrategy(cfg).evaluateEntry(candles, cfg);
  if (!plan) {
    console.log("➡  NO TRADE right now.");
    console.log("   The strategy only fires on a fresh breakout in an uptrend.");
    console.log("   Re-run this when price approaches the breakout level above.");
    return;
  }

  const size = sizePosition({
    equity: balance,
    cash: balance,
    riskPerTrade: cfg.riskPerTrade,
    entry: plan.entry,
    stop: plan.stop,
    feeRate: cfg.feeRate,
  });
  const riskAmt = size.quantity * (plan.entry - plan.stop);

  console.log(`🟢  ${plan.grade} LONG SIGNAL  (${plan.strategy})`);
  console.log(`   Entry    ${fmtUsd(plan.entry)}  (market, ~current price)`);
  console.log(`   Stop     ${fmtUsd(plan.stop)}   (${fmtPct((plan.stop - plan.entry) / plan.entry)})`);
  console.log(
    `   Target   ${plan.target != null ? `${fmtUsd(plan.target)}  (${plan.riskReward}:1)` : "trailing stop — no fixed target (let it run)"}`,
  );
  console.log(`   Size     ${fmtNum(size.quantity, 6)} ${cfg.symbol.replace(cfg.quoteCurrency, "")}  (≈ ${fmtUsd(size.notional)})`);
  console.log(`   Risk     ${fmtUsd(riskAmt)} (≈ ${fmtNum(toNzd(riskAmt, cfg.nzdPerUsd))} NZD) if the stop is hit`);
  if (size.capped) console.log("   ⚠ size capped by available balance (no leverage on spot)");
  console.log(`   Why      ${plan.reason}`);
}

main().catch((e) => {
  console.error("Signal failed:", e);
  process.exit(1);
});
