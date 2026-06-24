import type { AppConfig } from "../config";
import type { Broker, MarketDataProvider, OrderRequest, OrderResult } from "./types";

// ---------------------------------------------------------------------------
// Paper broker: simulates fills at the current market price plus the configured
// fee. It does NOT mutate account state — the engine records fills, so paper and
// live share identical bookkeeping. Fills at ticker.last (no slippage model).
// ---------------------------------------------------------------------------

let counter = 0;

export class PaperBroker implements Broker {
  readonly name = "paper";
  readonly isLive = false;

  constructor(
    private readonly md: MarketDataProvider,
    private readonly cfg: AppConfig,
  ) {}

  async placeMarketOrder(req: OrderRequest): Promise<OrderResult> {
    const ticker = await this.md.getTicker(req.symbol);
    const price = ticker.last;
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`Paper broker: invalid market price for ${req.symbol}`);
    }
    const notional = price * req.quantity;
    const fee = notional * this.cfg.feeRate;
    counter = (counter + 1) % 1_000_000;
    return {
      orderId: `paper-${Date.now()}-${counter}`,
      symbol: req.symbol,
      side: req.side,
      quantity: req.quantity,
      price,
      fee,
      timestamp: Math.floor(Date.now() / 1000),
    };
  }
}
