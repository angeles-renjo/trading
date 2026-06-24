import { getConfig, isLiveTradingEnabled, type AppConfig } from "../config";
import { createMarketData } from "../exchange";
import type { Broker, MarketDataProvider } from "../exchange/types";
import { PaperBroker } from "../exchange/paper-broker";
import { BybitBroker } from "../exchange/bybit-broker";
import { FileStorage, type Storage } from "../storage/file-store";
import { createNotifier } from "../notify";
import type { Notifier } from "../notify/types";
import { TradingEngine } from "./engine";

// ---------------------------------------------------------------------------
// Single place that wires the whole trading stack together, choosing the live
// Bybit broker only when it is explicitly and safely enabled. Shared by the
// bot CLI and the Next.js API routes so they always see the same account.
// ---------------------------------------------------------------------------

export interface Wiring {
  cfg: AppConfig;
  md: MarketDataProvider;
  broker: Broker;
  storage: Storage;
  notifier: Notifier;
  engine: TradingEngine;
  live: boolean;
}

export function createWiring(cfg: AppConfig = getConfig()): Wiring {
  const md = createMarketData(cfg);
  const storage = new FileStorage(cfg);
  const notifier = createNotifier(cfg);
  const live = isLiveTradingEnabled(cfg);

  if (live && cfg.marketDataSource !== "bybit") {
    console.warn(
      "[config] LIVE trading enabled but MARKET_DATA_SOURCE is not 'bybit' — live prices should come from Bybit.",
    );
  }

  const broker: Broker = live
    ? new BybitBroker(
        cfg.bybitBaseUrl,
        cfg.category,
        cfg.apiKey!,
        cfg.apiSecret!,
        cfg.feeRate,
        cfg.useExchangeStop,
      )
    : new PaperBroker(md, cfg);

  const engine = new TradingEngine({ cfg, md, broker, storage, notifier });
  return { cfg, md, broker, storage, notifier, engine, live };
}

let cached: Wiring | null = null;

export function getWiring(): Wiring {
  if (!cached) cached = createWiring();
  return cached;
}
