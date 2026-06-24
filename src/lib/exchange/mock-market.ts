import type { Candle, Ticker } from "../types";
import type { CandleQuery, MarketDataProvider } from "./types";
import { intervalToSeconds } from "./interval";

// ---------------------------------------------------------------------------
// Deterministic synthetic market data for offline development, demos, and
// tests (e.g. when api.bybit.com is unreachable). The series is shaped with
// overlapping waves + noise so that real support/resistance zones form and the
// strategy actually produces setups. Seeded by symbol so the shape is stable
// across calls within a process.
// ---------------------------------------------------------------------------

function hashSeed(s: string): number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class MockMarketData implements MarketDataProvider {
  readonly name = "mock";

  constructor(private readonly basePrice = 60_000) {}

  private series(symbol: string, count: number): number[] {
    const rnd = mulberry32(hashSeed(symbol));
    const base = this.basePrice;
    const out: number[] = [];
    let walk = 0;
    for (let i = 0; i < count; i++) {
      // Two overlapping ranges create layered S/R; the walk adds slow regime
      // drift; noise produces the wicks that touch zones.
      const wave1 = Math.sin(i / 70) * base * 0.07;
      const wave2 = Math.sin(i / 23 + 1.3) * base * 0.025;
      walk += (rnd() - 0.5) * base * 0.004;
      // gentle mean-reversion so it doesn't run away
      walk *= 0.997;
      const noise = (rnd() - 0.5) * base * 0.004;
      out.push(Math.max(base * 0.2, base + wave1 + wave2 + walk + noise));
    }
    return out;
  }

  async getHistory(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    const step = intervalToSeconds(interval);
    const now = Math.floor(Date.now() / 1000);
    const lastOpen = Math.floor(now / step) * step;
    const prices = this.series(symbol, limit + 1);
    const rnd = mulberry32(hashSeed(symbol) ^ 0x9e3779b9);

    const candles: Candle[] = [];
    for (let i = 1; i < prices.length; i++) {
      const open = prices[i - 1];
      const close = prices[i];
      const wick = Math.abs(close - open) * (0.5 + rnd()) + open * 0.0015 * rnd();
      const high = Math.max(open, close) + wick;
      const low = Math.min(open, close) - wick;
      const time = lastOpen - (prices.length - 1 - i) * step;
      candles.push({
        time,
        open: round2(open),
        high: round2(high),
        low: round2(Math.max(low, 1)),
        close: round2(close),
        volume: round2(50 + rnd() * 200),
      });
    }
    return candles;
  }

  async getCandles(symbol: string, interval: string, query: CandleQuery = {}): Promise<Candle[]> {
    return this.getHistory(symbol, interval, query.limit ?? 200);
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const candles = await this.getHistory(symbol, "60", 25);
    const last = candles[candles.length - 1];
    const dayAgo = candles[0];
    const change = (last.close - dayAgo.close) / dayAgo.close;
    return {
      symbol,
      last: last.close,
      change24hPct: round4(change),
      high24h: Math.max(...candles.map((c) => c.high)),
      low24h: Math.min(...candles.map((c) => c.low)),
      volume24h: round2(candles.reduce((s, c) => s + c.volume, 0)),
      turnover24h: round2(candles.reduce((s, c) => s + c.volume * c.close, 0)),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
