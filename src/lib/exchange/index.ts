import { getConfig, type AppConfig } from "../config";
import type { MarketDataProvider } from "./types";
import { BybitMarketData } from "./bybit-market";
import { MockMarketData } from "./mock-market";

export * from "./types";
export { BybitMarketData } from "./bybit-market";
export { MockMarketData } from "./mock-market";
export { intervalToSeconds, isValidInterval } from "./interval";

let cached: MarketDataProvider | null = null;

export function createMarketData(cfg: AppConfig): MarketDataProvider {
  if (cfg.marketDataSource === "mock") {
    return new MockMarketData();
  }
  return new BybitMarketData(cfg.bybitBaseUrl, cfg.category);
}

/** Process-wide singleton market data provider. */
export function getMarketData(): MarketDataProvider {
  if (!cached) cached = createMarketData(getConfig());
  return cached;
}
