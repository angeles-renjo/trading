// API response shapes shared between server routes and client components.
// Pure types only — safe to import from client code.

import type { Fill, Position, TradePlan, Zone } from "../types";
import type { BacktestResult } from "../backtest/backtester";

export interface StatusResponse {
  live: boolean;
  tradingMode: "paper" | "live";
  marketDataSource: string;
  symbol: string;
  quoteCurrency: string;
  nzdPerUsd: number;
  price: number;
  account: {
    cash: number;
    startingBalance: number;
    equity: number;
    positionValue: number;
    unrealizedPnl: number;
    unrealizedPct: number;
    totalReturnPct: number;
    realizedPnlToday: number;
    halted: boolean;
  };
  position: Position | null;
  config: {
    riskPerTrade: number;
    riskReward: number;
    minGrade: string;
    maxTradesPerWeek: number;
    dailyLossLimitPct: number;
    primaryInterval: string;
  };
  plan: TradePlan | null;
  zones: Zone[];
  fills: Fill[];
  tradesThisWeek: number;
  fetchedAt: number;
  error?: string;
}

export interface CandlesResponse {
  symbol: string;
  interval: string;
  candles: Array<{ time: number; open: number; high: number; low: number; close: number }>;
  zones: Zone[];
  plan: TradePlan | null;
  error?: string;
}

export type { BacktestResult };
