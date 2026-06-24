import type { Candle, Ticker } from "../types";
import type { CandleQuery, MarketDataProvider } from "./types";
import type { BybitCategory } from "../config";

// ---------------------------------------------------------------------------
// Bybit V5 public market data (no auth required).
//   Klines:  GET /v5/market/kline
//   Tickers: GET /v5/market/tickers
// Docs: https://bybit-exchange.github.io/docs/v5/market/kline
//
// NOTE: this requires outbound access to api.bybit.com. Some sandboxed
// environments block it — use the mock provider there (MARKET_DATA_SOURCE=mock).
// ---------------------------------------------------------------------------

interface BybitResponse<T> {
  retCode: number;
  retMsg: string;
  result: T;
}

interface KlineResult {
  category: string;
  symbol: string;
  list: string[][]; // [start, open, high, low, close, volume, turnover], newest-first
}

interface TickerResult {
  category: string;
  list: Array<{
    symbol: string;
    lastPrice: string;
    prevPrice24h: string;
    price24hPcnt: string;
    highPrice24h: string;
    lowPrice24h: string;
    volume24h: string;
    turnover24h: string;
  }>;
}

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_PAGE = 1000;
const MAX_PAGES = 60; // safety cap (~60k candles)

export class BybitMarketData implements MarketDataProvider {
  readonly name = "bybit";

  constructor(
    private readonly baseUrl: string,
    private readonly category: BybitCategory,
  ) {}

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    url.searchParams.set("category", this.category);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }

    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch (err) {
      throw new Error(`Bybit request failed (${url.pathname}): ${(err as Error).message}`);
    }
    if (!res.ok) {
      throw new Error(`Bybit HTTP ${res.status} for ${url.pathname}`);
    }
    const json = (await res.json()) as BybitResponse<T>;
    if (json.retCode !== 0) {
      throw new Error(`Bybit API error ${json.retCode}: ${json.retMsg}`);
    }
    return json.result;
  }

  async getTicker(symbol: string): Promise<Ticker> {
    const result = await this.get<TickerResult>("/v5/market/tickers", { symbol });
    const t = result.list?.[0];
    if (!t) throw new Error(`No ticker returned for ${symbol}`);
    return {
      symbol: t.symbol,
      last: Number(t.lastPrice),
      change24hPct: Number(t.price24hPcnt),
      high24h: Number(t.highPrice24h),
      low24h: Number(t.lowPrice24h),
      volume24h: Number(t.volume24h),
      turnover24h: Number(t.turnover24h),
    };
  }

  async getCandles(symbol: string, interval: string, query: CandleQuery = {}): Promise<Candle[]> {
    const result = await this.get<KlineResult>("/v5/market/kline", {
      symbol,
      interval,
      limit: Math.min(query.limit ?? 200, MAX_PAGE),
      start: query.start !== undefined ? query.start * 1000 : undefined,
      end: query.end !== undefined ? query.end * 1000 : undefined,
    });
    return parseKlines(result.list);
  }

  async getHistory(symbol: string, interval: string, limit: number): Promise<Candle[]> {
    const byTime = new Map<number, Candle>();
    let endCursorMs: number | undefined; // exclusive upper bound for the next page

    for (let page = 0; page < MAX_PAGES && byTime.size < limit; page++) {
      const pageLimit = Math.min(MAX_PAGE, limit - byTime.size + 1);
      const candles = await this.getCandles(symbol, interval, {
        limit: pageLimit,
        end: endCursorMs !== undefined ? Math.floor(endCursorMs / 1000) : undefined,
      });
      if (candles.length === 0) break;

      for (const c of candles) byTime.set(c.time, c);

      const oldestMs = candles[0].time * 1000;
      const nextEnd = oldestMs - 1;
      if (endCursorMs !== undefined && nextEnd >= endCursorMs) break; // no progress
      endCursorMs = nextEnd;

      if (candles.length < pageLimit) break; // reached the start of history
    }

    return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-limit);
  }
}

function parseKlines(list: string[][]): Candle[] {
  const candles = list.map((row) => ({
    time: Math.floor(Number(row[0]) / 1000),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
  }));
  candles.sort((a, b) => a.time - b.time); // Bybit returns newest-first
  return candles;
}
