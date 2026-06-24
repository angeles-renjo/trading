import type { AccountState, Fill, FillReason } from "../types";
import type { OrderResult } from "../exchange/types";
import { utcDay } from "../storage/file-store";
import { round } from "../num";

// ---------------------------------------------------------------------------
// Pure-ish account state transitions. These mutate the passed AccountState and
// return the recorded fill, so the engine can persist once afterwards.
// Used identically by paper and live (live mirrors the exchange locally).
// ---------------------------------------------------------------------------

/** Reset the daily realised-P&L counter when the UTC day rolls over. */
export function rolloverDay(state: AccountState, nowSec: number): void {
  const today = utcDay(nowSec);
  if (state.pnlDay !== today) {
    state.pnlDay = today;
    state.realizedPnlToday = 0;
  }
}

export function recordEntry(
  state: AccountState,
  order: OrderResult,
  stop: number,
  target: number,
): Fill {
  const notional = order.price * order.quantity;
  const fill: Fill = {
    id: order.orderId,
    symbol: order.symbol,
    side: "buy",
    quantity: order.quantity,
    price: order.price,
    notional: round(notional, 2),
    fee: round(order.fee, 4),
    timestamp: order.timestamp,
    reason: "entry",
  };
  state.cash = round(state.cash - notional - order.fee, 2);
  state.position = {
    symbol: order.symbol,
    quantity: order.quantity,
    avgPrice: order.price,
    stop,
    target,
    entryFee: order.fee,
    openedAt: order.timestamp,
    openFillId: order.orderId,
  };
  state.fills.push(fill);
  return fill;
}

export function recordExit(
  state: AccountState,
  order: OrderResult,
  reason: FillReason,
): { fill: Fill; realizedPnl: number } {
  const pos = state.position;
  if (!pos) throw new Error("recordExit called with no open position");

  const notional = order.price * order.quantity;
  const costBasis = pos.avgPrice * order.quantity + pos.entryFee;
  const realizedPnl = round(notional - order.fee - costBasis, 2);

  const fill: Fill = {
    id: order.orderId,
    symbol: order.symbol,
    side: "sell",
    quantity: order.quantity,
    price: order.price,
    notional: round(notional, 2),
    fee: round(order.fee, 4),
    timestamp: order.timestamp,
    reason,
    realizedPnl,
  };

  state.cash = round(state.cash + notional - order.fee, 2);
  state.position = null;
  state.fills.push(fill);

  rolloverDay(state, order.timestamp);
  state.realizedPnlToday = round(state.realizedPnlToday + realizedPnl, 2);

  return { fill, realizedPnl };
}

export interface Valuation {
  cash: number;
  positionValue: number;
  equity: number;
  unrealizedPnl: number;
  unrealizedPct: number;
  totalReturnPct: number;
}

export function valueAccount(state: AccountState, price: number): Valuation {
  const positionValue = state.position ? state.position.quantity * price : 0;
  const unrealizedPnl = state.position
    ? (price - state.position.avgPrice) * state.position.quantity
    : 0;
  const cost = state.position
    ? state.position.avgPrice * state.position.quantity
    : 0;
  const equity = state.cash + positionValue;
  return {
    cash: round(state.cash, 2),
    positionValue: round(positionValue, 2),
    equity: round(equity, 2),
    unrealizedPnl: round(unrealizedPnl, 2),
    unrealizedPct: cost > 0 ? round(unrealizedPnl / cost, 4) : 0,
    totalReturnPct: round((equity - state.startingBalance) / state.startingBalance, 4),
  };
}
