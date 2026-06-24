import crypto from "node:crypto";
import type { Broker, OrderRequest, OrderResult } from "./types";
import type { BybitCategory } from "../config";

// ---------------------------------------------------------------------------
// Bybit V5 LIVE broker (signed, authenticated). Places real orders.
//
// ⚠️  EXPERIMENTAL / REAL MONEY. This path cannot be exercised from the build
//     sandbox (api.bybit.com is blocked here). ALWAYS validate it against
//     Bybit TESTNET first: set BYBIT_BASE_URL=https://api-testnet.bybit.com
//     with testnet API keys, confirm fills look right, THEN consider mainnet.
//
// Auth (per docs): sign = HMAC_SHA256(secret, timestamp + apiKey + recvWindow
//                  + (queryString | jsonBody)). Headers carry key/sign/ts.
// Market orders use marketUnit="baseCoin" so qty is always in the base asset
// (e.g. BTC), matching the engine's sizing for both buys and sells.
// ---------------------------------------------------------------------------

const RECV_WINDOW = "5000";
const TIMEOUT_MS = 15_000;

export class BybitBroker implements Broker {
  readonly name = "bybit-live";
  readonly isLive = true;

  constructor(
    private readonly baseUrl: string,
    private readonly category: BybitCategory,
    private readonly apiKey: string,
    private readonly apiSecret: string,
    private readonly feeRateFallback: number,
    private readonly useExchangeStop: boolean,
  ) {}

  async placeMarketOrder(req: OrderRequest): Promise<OrderResult> {
    // On a sell, clear any resting protective stop first so it can't double-fill.
    if (req.side === "sell" && this.useExchangeStop) {
      await this.cancelStops(req.symbol).catch(() => undefined);
    }

    const body: Record<string, string> = {
      category: this.category,
      symbol: req.symbol,
      side: req.side === "buy" ? "Buy" : "Sell",
      orderType: "Market",
      qty: String(req.quantity),
      marketUnit: "baseCoin",
    };
    const created = await this.post<{ orderId: string }>("/v5/order/create", body);

    const fill = await this.resolveFill(req.symbol, created.orderId);

    // Best-effort resting stop for crash safety (gated, never blocks the trade).
    if (req.side === "buy" && req.stopLoss && this.useExchangeStop) {
      await this.placeStopOrder(req.symbol, req.quantity, req.stopLoss).catch((e) => {
        console.error(`[bybit-live] failed to place protective stop: ${(e as Error).message}`);
      });
    }

    return fill;
  }

  /** Poll order history until the order's fill details are available. */
  private async resolveFill(symbol: string, orderId: string): Promise<OrderResult> {
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await this.get<{
        list: Array<{
          orderId: string;
          avgPrice: string;
          cumExecQty: string;
          cumExecValue: string;
          cumExecFee: string;
          orderStatus: string;
        }>;
      }>("/v5/order/history", { category: this.category, symbol, orderId });

      const o = res.list?.find((x) => x.orderId === orderId);
      if (o && Number(o.cumExecQty) > 0) {
        const qty = Number(o.cumExecQty);
        const value = Number(o.cumExecValue);
        const price = Number(o.avgPrice) || (qty > 0 ? value / qty : 0);
        const fee = Number(o.cumExecFee) || value * this.feeRateFallback;
        return {
          orderId,
          symbol,
          side: "buy", // overwritten by caller context; not used downstream
          quantity: qty,
          price,
          fee,
          timestamp: Math.floor(Date.now() / 1000),
        };
      }
      await delay(400);
    }
    throw new Error(`Could not resolve fill for order ${orderId} (check Bybit dashboard)`);
  }

  private async placeStopOrder(symbol: string, qty: number, stopPrice: number): Promise<void> {
    await this.post("/v5/order/create", {
      category: this.category,
      symbol,
      side: "Sell",
      orderType: "Market",
      qty: String(qty),
      marketUnit: "baseCoin",
      triggerPrice: String(stopPrice),
      triggerDirection: "2", // trigger when last price falls to triggerPrice
      orderFilter: "StopOrder",
    });
  }

  async cancelStops(symbol: string): Promise<void> {
    await this.post("/v5/order/cancel-all", {
      category: this.category,
      symbol,
      orderFilter: "StopOrder",
    });
  }

  // --- signed transport --------------------------------------------------

  private headers(signPayload: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const sign = crypto
      .createHmac("sha256", this.apiSecret)
      .update(timestamp + this.apiKey + RECV_WINDOW + signPayload)
      .digest("hex");
    return {
      "X-BAPI-API-KEY": this.apiKey,
      "X-BAPI-SIGN": sign,
      "X-BAPI-TIMESTAMP": timestamp,
      "X-BAPI-RECV-WINDOW": RECV_WINDOW,
      "Content-Type": "application/json",
    };
  }

  private async post<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const json = JSON.stringify(body);
    const res = await fetch(this.baseUrl + path, {
      method: "POST",
      headers: this.headers(json),
      body: json,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return this.unwrap<T>(res, path);
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${this.baseUrl}${path}?${qs}`, {
      method: "GET",
      headers: this.headers(qs),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return this.unwrap<T>(res, path);
  }

  private async unwrap<T>(res: Response, path: string): Promise<T> {
    if (!res.ok) throw new Error(`Bybit HTTP ${res.status} for ${path}`);
    const json = (await res.json()) as { retCode: number; retMsg: string; result: T };
    if (json.retCode !== 0) {
      throw new Error(`Bybit API error ${json.retCode}: ${json.retMsg} (${path})`);
    }
    return json.result;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
