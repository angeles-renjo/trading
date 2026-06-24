import type { AppConfig } from "./config";
import type { AccountState, Candle } from "./types";
import type { Storage } from "./storage/file-store";
import type { MarketDataProvider } from "./exchange/types";
import { createFreshAccount } from "./storage/file-store";

// Test helpers (imported only by *.test.ts files).

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    marketDataSource: "mock",
    bybitBaseUrl: "https://api.bybit.com",
    category: "spot",
    symbol: "BTCUSDT",
    quoteCurrency: "USDT",
    primaryInterval: "240",
    contextInterval: "D",
    strategy: "sr",
    donchianN: 20,
    trendMaPeriod: 50,
    atrPeriod: 14,
    atrMult: 3,
    startingBalance: 10_000,
    feeRate: 0.001,
    riskPerTrade: 0.01,
    riskReward: 2,
    maxOpenPositions: 1,
    maxTradesPerWeek: 3,
    dailyLossLimitPct: 0.06,
    pivotLookback: 3,
    zoneWidthPct: 0.006,
    minTouches: 2,
    minStopPct: 0.005,
    minStrengthAPlus: 65,
    minGrade: "A+",
    tradingMode: "paper",
    armed: false,
    useExchangeStop: false,
    pollIntervalSec: 60,
    dataDir: ".data-test",
    nzdPerUsd: 1.66,
    ...overrides,
  };
}

function candle(time: number, o: number, h: number, l: number, c: number): Candle {
  return { time, open: o, high: h, low: l, close: c, volume: 100 };
}

/**
 * Build a clean oscillating series between support S and resistance R that
 * produces a strong support zone, then append a confirmed bullish bounce as the
 * final (closed) candle so the strategy emits an A+ long setup.
 */
export function buildBounceSeries(opts?: {
  S?: number;
  R?: number;
  cycles?: number;
  period?: number;
  intervalSec?: number;
  endTime?: number;
}): Candle[] {
  const S = opts?.S ?? 10_000;
  const R = opts?.R ?? 11_000;
  const cycles = opts?.cycles ?? 6;
  const period = opts?.period ?? 24;
  const step = opts?.intervalSec ?? 240 * 60;
  const mid = (S + R) / 2;
  const amp = (R - S) / 2;
  const n = cycles * period;

  const candles: Candle[] = [];
  // Start far enough in the past that the final appended candle is "closed".
  const endTime = opts?.endTime ?? Math.floor(Date.now() / 1000) - step;
  const startTime = endTime - n * step;

  for (let i = 0; i < n; i++) {
    // Trough at the start of each period (phase chosen so min is well-sampled).
    const c = mid - amp * Math.cos((2 * Math.PI * i) / period);
    const wick = c * 0.0005;
    candles.push(candle(startTime + i * step, c, c + wick, c - wick, c));
  }

  // Final confirmed bullish bounce off support.
  const low = S - S * 0.0005;
  const close = S * 1.012;
  candles.push(candle(endTime, S * 1.002, S * 1.013, low, close));
  return candles;
}

/**
 * Build a steadily rising series with noise so breakouts fire and the trend
 * filter passes — used to exercise the trend-following strategy.
 */
export function buildTrendSeries(opts?: {
  n?: number;
  start?: number;
  driftPerBar?: number;
  intervalSec?: number;
}): Candle[] {
  const n = opts?.n ?? 300;
  const start = opts?.start ?? 10_000;
  const drift = opts?.driftPerBar ?? 0.004;
  const step = opts?.intervalSec ?? 240 * 60;
  const endTime = Math.floor(Date.now() / 1000) - step;
  const startTime = endTime - n * step;

  let seed = 987654321;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const candles: Candle[] = [];
  let price = start;
  for (let i = 0; i < n; i++) {
    const open = i ? candles[i - 1].close : price * 0.999;
    price = price * (1 + drift + (rnd() - 0.5) * 0.01);
    const close = price;
    const high = Math.max(open, close) * (1 + 0.003 * rnd());
    const low = Math.min(open, close) * (1 - 0.003 * rnd());
    candles.push(candle(startTime + i * step, open, high, low, close));
  }
  return candles;
}

/** In-memory Storage for tests. */
export class MemoryStorage implements Storage {
  private state: AccountState;
  constructor(cfg: AppConfig) {
    this.state = createFreshAccount(cfg);
  }
  async load(): Promise<AccountState> {
    return this.state;
  }
  async save(state: AccountState): Promise<void> {
    this.state = state;
  }
  async reset(): Promise<AccountState> {
    return this.state;
  }
}

/** Market data stub with a settable spot price and a fixed candle series. */
export class StubMarketData implements MarketDataProvider {
  readonly name = "stub";
  price: number;
  constructor(
    private readonly candles: Candle[],
    price?: number,
  ) {
    this.price = price ?? candles[candles.length - 1].close;
  }
  async getTicker(symbol: string) {
    return {
      symbol,
      last: this.price,
      change24hPct: 0,
      high24h: this.price,
      low24h: this.price,
      volume24h: 0,
      turnover24h: 0,
    };
  }
  async getCandles() {
    return this.candles;
  }
  async getHistory() {
    return this.candles;
  }
}
