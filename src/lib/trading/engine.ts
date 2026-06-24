import type { AppConfig } from "../config";
import type { Broker, MarketDataProvider, OrderRequest } from "../exchange/types";
import type { Storage } from "../storage/file-store";
import type { Notifier, BotEvent } from "../notify/types";
import type { AccountState, TradePlan } from "../types";
import { analyze, gradeAtLeast } from "../strategy";
import { intervalToSeconds } from "../exchange/interval";
import { sizePosition, entryGate } from "./risk";
import { recordEntry, recordExit, rolloverDay, valueAccount } from "./account";

// ---------------------------------------------------------------------------
// The trading engine. One `tick()` is one decision cycle:
//   - if a position is open: check stop/target and exit if hit
//   - if flat: run the strategy, gate it (risk limits), size it, and enter
// It is broker-agnostic: paper and live behave identically here, and the live
// broker makes order execution safe (exchange stop on entry, idempotent exits).
// ---------------------------------------------------------------------------

const HISTORY_BARS = 400;

export interface EngineDeps {
  cfg: AppConfig;
  md: MarketDataProvider;
  broker: Broker;
  storage: Storage;
  notifier?: Notifier;
}

export type TickAction = "none" | "entered" | "exited" | "blocked";

export interface TickResult {
  action: TickAction;
  price: number;
  detail: string;
  plan?: TradePlan | null;
}

export class TradingEngine {
  constructor(private readonly deps: EngineDeps) {}

  async tick(): Promise<TickResult> {
    const { cfg, md, storage } = this.deps;
    const nowSec = Math.floor(Date.now() / 1000);
    const state = await storage.load();
    rolloverDay(state, nowSec);

    const ticker = await md.getTicker(cfg.symbol);
    const price = ticker.last;

    let result: TickResult;
    if (state.position) {
      result = await this.manageOpen(state, price);
    } else {
      result = await this.maybeEnter(state, price, nowSec);
    }

    await storage.save(state);
    return result;
  }

  private async manageOpen(state: AccountState, price: number): Promise<TickResult> {
    const { broker } = this.deps;
    const pos = state.position!;

    let reason: "stop" | "target" | null = null;
    if (price <= pos.stop) reason = "stop";
    else if (price >= pos.target) reason = "target";

    if (!reason) {
      return {
        action: "none",
        price,
        detail: `holding ${pos.quantity} @ ${pos.avgPrice}; price ${price} within [${pos.stop}, ${pos.target}]`,
      };
    }

    const order = await broker.placeMarketOrder({
      symbol: pos.symbol,
      side: "sell",
      quantity: pos.quantity,
      reason,
    });
    const { realizedPnl } = recordExit(state, order, reason);

    await this.emit({
      type: "exit",
      message: `Exited ${pos.symbol} via ${reason.toUpperCase()} @ ${order.price} — P&L ${realizedPnl >= 0 ? "+" : ""}${realizedPnl}`,
      time: order.timestamp,
      data: { reason, price: order.price, realizedPnl, quantity: order.quantity },
    });

    return {
      action: "exited",
      price: order.price,
      detail: `Exit (${reason}) @ ${order.price}, realised P&L ${realizedPnl}`,
    };
  }

  private async maybeEnter(
    state: AccountState,
    price: number,
    nowSec: number,
  ): Promise<TickResult> {
    const { cfg, md, broker } = this.deps;

    const equity = valueAccount(state, price).equity;
    const gate = entryGate({
      cfg,
      hasOpenPosition: false,
      halted: state.halted,
      equity,
      realizedPnlToday: state.realizedPnlToday,
      fills: state.fills,
      nowSec,
    });
    if (!gate.ok) {
      return { action: "blocked", price, detail: gate.reason ?? "entry blocked" };
    }

    const candles = await md.getHistory(cfg.symbol, cfg.primaryInterval, HISTORY_BARS);
    // Only act on CLOSED candles — drop the last bar if it is still forming.
    const intervalSec = intervalToSeconds(cfg.primaryInterval);
    const closed =
      candles.length && candles[candles.length - 1].time + intervalSec > nowSec
        ? candles.slice(0, -1)
        : candles;
    const { plan } = analyze(closed, cfg);

    if (!plan || !gradeAtLeast(plan.grade, cfg.minGrade)) {
      return {
        action: "none",
        price,
        detail: plan ? `setup graded ${plan.grade}, below ${cfg.minGrade}` : "no setup",
        plan: plan ?? null,
      };
    }

    const size = sizePosition({
      equity,
      cash: state.cash,
      riskPerTrade: cfg.riskPerTrade,
      entry: price,
      stop: plan.stop,
      feeRate: cfg.feeRate,
    });
    if (size.quantity <= 0 || size.notional <= 0) {
      return {
        action: "blocked",
        price,
        detail: "computed position size is zero (account may be too small for this stop distance)",
        plan,
      };
    }

    const req: OrderRequest = {
      symbol: cfg.symbol,
      side: "buy",
      quantity: size.quantity,
      stopLoss: plan.stop,
      takeProfit: plan.target,
      reason: "entry",
    };
    const order = await broker.placeMarketOrder(req);
    recordEntry(state, order, plan.stop, plan.target);

    await this.emit({
      type: "entry",
      message: `Entered ${cfg.symbol} ${order.quantity} @ ${order.price} (${plan.grade}) — stop ${plan.stop}, target ${plan.target}`,
      time: order.timestamp,
      data: {
        grade: plan.grade,
        entry: order.price,
        stop: plan.stop,
        target: plan.target,
        quantity: order.quantity,
        riskReward: plan.riskReward,
        reason: plan.reason,
        capped: size.capped,
      },
    });

    return {
      action: "entered",
      price: order.price,
      detail: `Entered long ${order.quantity} @ ${order.price} (stop ${plan.stop}, target ${plan.target})`,
      plan,
    };
  }

  private async emit(event: BotEvent): Promise<void> {
    if (!this.deps.notifier) return;
    try {
      await this.deps.notifier.notify(event);
    } catch {
      // never let notification failures break trading
    }
  }
}
