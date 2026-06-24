// ---------------------------------------------------------------------------
// Central configuration, sourced from environment variables with safe defaults.
// See .env.example for documentation of every value.
// ---------------------------------------------------------------------------

import type { SetupGrade } from "./types";

export type MarketDataSource = "bybit" | "mock";
export type TradingMode = "paper" | "live";
export type BybitCategory = "spot" | "linear" | "inverse";

export interface AppConfig {
  // --- market data ---
  marketDataSource: MarketDataSource;
  bybitBaseUrl: string;
  category: BybitCategory;
  symbol: string;
  quoteCurrency: string;

  // --- timeframes ---
  /** Primary trading timeframe (Bybit interval code, e.g. "240" = 4h). */
  primaryInterval: string;
  /** Higher timeframe used for level context (e.g. "D"). */
  contextInterval: string;

  // --- account / risk ---
  startingBalance: number;
  feeRate: number;
  /** Fraction of equity risked per trade (0.01 = 1%). */
  riskPerTrade: number;
  /** Reward-to-risk ratio the strategy targets (2 = 2:1). */
  riskReward: number;
  maxOpenPositions: number;
  /** Selectivity guard: don't take more than this many trades in 7 days. */
  maxTradesPerWeek: number;
  /** Halt new entries after losing this fraction of equity in a day. */
  dailyLossLimitPct: number;

  // --- strategy params ---
  /** Bars on each side required to confirm a swing pivot. */
  pivotLookback: number;
  /** Zone clustering width as a fraction of price (0.005 = 0.5%). */
  zoneWidthPct: number;
  /** Minimum touches for a zone to be tradeable. */
  minTouches: number;
  /** Noise floor on stop distance as a fraction of entry. Keep comfortably
   *  above round-trip fees (2×feeRate) so fees don't dominate the risk. */
  minStopPct: number;
  /** Minimum zone strength (0..100) for an A+ grade. */
  minStrengthAPlus: number;
  /** Lowest setup grade the bot will actually trade. */
  minGrade: SetupGrade;

  // --- execution ---
  tradingMode: TradingMode;
  /** Master safety switch: live orders are placed only when this is true. */
  armed: boolean;
  apiKey?: string;
  apiSecret?: string;
  /** Place a resting stop on the exchange at entry (crash safety). Test on
   *  testnet before enabling — it is off by default. */
  useExchangeStop: boolean;
  /** Seconds between bot decision cycles. */
  pollIntervalSec: number;

  // --- misc ---
  dataDir: string;
  webhookUrl?: string;
  /** For display only: how many NZD per 1 USD (e.g. 1.66). */
  nzdPerUsd: number;
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

function str(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw === undefined || raw.trim() === "" ? fallback : raw.trim();
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(raw.trim().toLowerCase());
}

let cached: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (cached) return cached;

  const quoteCurrency = str("QUOTE_CURRENCY", "USDT");
  const baseSymbol = str("SYMBOL", "BTC");
  // Allow SYMBOL to be either "BTC" or a full pair like "BTCUSDT".
  const symbol = baseSymbol.endsWith(quoteCurrency)
    ? baseSymbol
    : `${baseSymbol}${quoteCurrency}`;

  cached = {
    marketDataSource: str("MARKET_DATA_SOURCE", "bybit") as MarketDataSource,
    bybitBaseUrl: str("BYBIT_BASE_URL", "https://api.bybit.com").replace(/\/$/, ""),
    category: str("BYBIT_CATEGORY", "spot") as BybitCategory,
    symbol,
    quoteCurrency,

    primaryInterval: str("PRIMARY_INTERVAL", "240"),
    contextInterval: str("CONTEXT_INTERVAL", "D"),

    startingBalance: num("STARTING_BALANCE", 10_000),
    feeRate: num("FEE_RATE", 0.001),
    riskPerTrade: num("RISK_PER_TRADE", 0.01),
    riskReward: num("RISK_REWARD", 2),
    maxOpenPositions: num("MAX_OPEN_POSITIONS", 1),
    maxTradesPerWeek: num("MAX_TRADES_PER_WEEK", 3),
    dailyLossLimitPct: num("DAILY_LOSS_LIMIT_PCT", 0.06),

    pivotLookback: num("PIVOT_LOOKBACK", 3),
    zoneWidthPct: num("ZONE_WIDTH_PCT", 0.006),
    minTouches: num("MIN_TOUCHES", 2),
    minStopPct: num("MIN_STOP_PCT", 0.005),
    minStrengthAPlus: num("MIN_STRENGTH_APLUS", 65),
    minGrade: str("MIN_GRADE", "A+") as SetupGrade,

    tradingMode: str("TRADING_MODE", "paper") as TradingMode,
    armed: bool("BOT_ARMED", false),
    apiKey: process.env.BYBIT_API_KEY?.trim() || undefined,
    apiSecret: process.env.BYBIT_API_SECRET?.trim() || undefined,
    useExchangeStop: bool("USE_EXCHANGE_STOP", false),
    pollIntervalSec: num("POLL_INTERVAL_SEC", 60),

    dataDir: str("DATA_DIR", ".data"),
    webhookUrl: process.env.WEBHOOK_URL?.trim() || undefined,
    nzdPerUsd: num("NZD_PER_USD", 1.66),
  };

  return cached;
}

/** Test helper: clear the memoised config so env changes take effect. */
export function resetConfigCache(): void {
  cached = null;
}

/** True only when it is safe to place real orders. */
export function isLiveTradingEnabled(cfg: AppConfig = getConfig()): boolean {
  return (
    cfg.tradingMode === "live" &&
    cfg.armed &&
    !!cfg.apiKey &&
    !!cfg.apiSecret
  );
}
