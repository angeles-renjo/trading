import { getWiring } from "../trading/factory";
import { analyze } from "../strategy";
import { valueAccount } from "../trading/account";
import { countEntries } from "../trading/risk";
import { intervalToSeconds } from "../exchange/interval";
import type { StatusResponse, CandlesResponse } from "../api/types";

// ---------------------------------------------------------------------------
// Server-side assemblers for the dashboard. These tolerate market-data
// failures (e.g. Bybit blocked) by returning a partial payload with `error`
// set, so the UI degrades gracefully instead of 500-ing.
// ---------------------------------------------------------------------------

const WEEK_SEC = 7 * 24 * 60 * 60;
const HISTORY_BARS = 400;

function closedCandles<T extends { time: number }>(candles: T[], interval: string): T[] {
  const now = Math.floor(Date.now() / 1000);
  const step = intervalToSeconds(interval);
  if (candles.length && candles[candles.length - 1].time + step > now) {
    return candles.slice(0, -1);
  }
  return candles;
}

export async function buildStatus(): Promise<StatusResponse> {
  const { cfg, md, storage, live } = getWiring();
  const now = Math.floor(Date.now() / 1000);
  const state = await storage.load();

  const base: StatusResponse = {
    live,
    tradingMode: cfg.tradingMode,
    marketDataSource: cfg.marketDataSource,
    symbol: cfg.symbol,
    quoteCurrency: cfg.quoteCurrency,
    nzdPerUsd: cfg.nzdPerUsd,
    price: 0,
    account: {
      cash: state.cash,
      startingBalance: state.startingBalance,
      equity: state.cash,
      positionValue: 0,
      unrealizedPnl: 0,
      unrealizedPct: 0,
      totalReturnPct: (state.cash - state.startingBalance) / state.startingBalance,
      realizedPnlToday: state.realizedPnlToday,
      halted: state.halted,
    },
    position: state.position,
    config: {
      riskPerTrade: cfg.riskPerTrade,
      riskReward: cfg.riskReward,
      minGrade: cfg.minGrade,
      maxTradesPerWeek: cfg.maxTradesPerWeek,
      dailyLossLimitPct: cfg.dailyLossLimitPct,
      primaryInterval: cfg.primaryInterval,
    },
    plan: null,
    zones: [],
    fills: state.fills.slice(-50).reverse(),
    tradesThisWeek: countEntries(state.fills, now, WEEK_SEC),
    fetchedAt: now,
  };

  try {
    const ticker = await md.getTicker(cfg.symbol);
    const val = valueAccount(state, ticker.last);
    base.price = ticker.last;
    base.account.equity = val.equity;
    base.account.positionValue = val.positionValue;
    base.account.unrealizedPnl = val.unrealizedPnl;
    base.account.unrealizedPct = val.unrealizedPct;
    base.account.totalReturnPct = val.totalReturnPct;

    const candles = await md.getHistory(cfg.symbol, cfg.primaryInterval, HISTORY_BARS);
    const { zones, plan } = analyze(closedCandles(candles, cfg.primaryInterval), cfg);
    base.zones = zones;
    base.plan = plan;
  } catch (err) {
    base.error = `Market data unavailable: ${(err as Error).message}`;
  }

  return base;
}

export async function buildCandles(interval: string, limit: number): Promise<CandlesResponse> {
  const { cfg, md } = getWiring();
  const res: CandlesResponse = {
    symbol: cfg.symbol,
    interval,
    candles: [],
    zones: [],
    plan: null,
  };
  try {
    const candles = await md.getHistory(cfg.symbol, interval, limit);
    res.candles = candles.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    // Analyse on the configured trading timeframe for the overlay.
    const analysisCandles = await md.getHistory(cfg.symbol, cfg.primaryInterval, HISTORY_BARS);
    const { zones, plan } = analyze(closedCandles(analysisCandles, cfg.primaryInterval), cfg);
    res.zones = zones;
    res.plan = plan;
  } catch (err) {
    res.error = `Market data unavailable: ${(err as Error).message}`;
  }
  return res;
}
