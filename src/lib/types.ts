// ---------------------------------------------------------------------------
// Shared domain types for the crypto trading partner.
// Kept framework-agnostic so the strategy, backtester and bot can all use them
// without pulling in Next.js.
// ---------------------------------------------------------------------------

/** A single OHLCV candle. `time` is the candle OPEN time, in unix seconds. */
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Live market snapshot for a symbol. */
export interface Ticker {
  symbol: string;
  last: number;
  /** 24h change as a fraction (0.0234 = +2.34%). */
  change24hPct: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  turnover24h: number;
}

/** A swing pivot (local extreme) found on a candle series. */
export interface Pivot {
  time: number;
  price: number;
  kind: "high" | "low";
  /** Index of the pivot candle in the source series. */
  index: number;
}

/** A clustered support or resistance zone. */
export interface Zone {
  kind: "support" | "resistance";
  /** Band bounds. */
  lower: number;
  upper: number;
  center: number;
  /** Number of pivots that formed/retested this zone. */
  touches: number;
  /** Composite strength score, 0..100. */
  strength: number;
  /** Unix seconds of the most recent touch. */
  lastTouchTime: number;
}

export type SetupGrade = "A+" | "A" | "B";

/**
 * A concrete, actionable trade plan produced by the strategy.
 * Spot, long-only for now (buy at support, exit at target or stop).
 */
export interface TradePlan {
  time: number;
  symbol: string;
  side: "long";
  grade: SetupGrade;
  entry: number;
  stop: number;
  target: number;
  /** reward : risk, e.g. 2 means target is 2x as far as the stop. */
  riskReward: number;
  /** Human-readable explanation of why this setup qualified. */
  reason: string;
  /** The support zone the price is reacting to. */
  zone: Zone;
}

export type Side = "buy" | "sell";
export type FillReason = "entry" | "target" | "stop" | "manual" | "liquidate";

/** An executed fill (paper or live). */
export interface Fill {
  id: string;
  symbol: string;
  side: Side;
  quantity: number;
  price: number;
  /** quantity * price */
  notional: number;
  fee: number;
  timestamp: number;
  reason: FillReason;
  /** Realised P&L (net of fees) for closing fills. */
  realizedPnl?: number;
}

/** An open position. The MVP runs a single position at a time (BTC only). */
export interface Position {
  symbol: string;
  quantity: number;
  avgPrice: number;
  stop: number;
  target: number;
  /** Fee paid on entry, used to compute net realised P&L on exit. */
  entryFee: number;
  openedAt: number;
  openFillId: string;
}

/** Persisted account state. */
export interface AccountState {
  cash: number;
  startingBalance: number;
  position: Position | null;
  fills: Fill[];
  createdAt: number;
  updatedAt: number;
  /** Circuit-breaker bookkeeping. */
  realizedPnlToday: number;
  /** YYYY-MM-DD of the day realizedPnlToday applies to. */
  pnlDay: string;
  /** When true, the bot will not open new positions until manually resumed. */
  halted: boolean;
}
