import type { Candle, Ticker, Side } from "../types";

// ---------------------------------------------------------------------------
// The exchange boundary. The rest of the app depends only on these interfaces,
// so swapping mock ⇄ Bybit, or paper ⇄ live, never touches strategy or UI code.
// ---------------------------------------------------------------------------

export interface CandleQuery {
  limit?: number;
  /** Inclusive start time in unix seconds. */
  start?: number;
  /** Inclusive end time in unix seconds. */
  end?: number;
}

export interface MarketDataProvider {
  readonly name: string;
  getTicker(symbol: string): Promise<Ticker>;
  /** A single page of candles (ascending by time). */
  getCandles(symbol: string, interval: string, query?: CandleQuery): Promise<Candle[]>;
  /** The most recent `limit` candles, paging back as needed (ascending). */
  getHistory(symbol: string, interval: string, limit: number): Promise<Candle[]>;
}

export interface OrderRequest {
  symbol: string;
  side: Side;
  quantity: number;
  /** Attach a protective stop on entry (live brokers place it on the exchange). */
  stopLoss?: number;
  takeProfit?: number;
  reason?: string;
}

export interface OrderResult {
  orderId: string;
  symbol: string;
  side: Side;
  quantity: number;
  /** Average fill price. */
  price: number;
  fee: number;
  timestamp: number;
}

export interface Broker {
  readonly name: string;
  readonly isLive: boolean;
  placeMarketOrder(req: OrderRequest): Promise<OrderResult>;
}
