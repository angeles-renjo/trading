import type { AppConfig } from "../config";
import type { Fill } from "../types";
import { roundQty } from "../num";

// ---------------------------------------------------------------------------
// Risk management: position sizing and entry gating (circuit breakers).
// Shared by the backtester, the paper broker and the live bot so simulated
// and real behaviour stay identical.
// ---------------------------------------------------------------------------

export interface SizeResult {
  quantity: number;
  notional: number;
  /** Currency at risk if the stop is hit (after sizing/capping). */
  riskAmount: number;
  /** True if the size was reduced to fit available cash (no leverage on spot). */
  capped: boolean;
}

export function sizePosition(params: {
  equity: number;
  cash: number;
  riskPerTrade: number;
  entry: number;
  stop: number;
  feeRate: number;
}): SizeResult {
  const { equity, cash, riskPerTrade, entry, stop, feeRate } = params;
  const riskPerUnit = entry - stop;
  if (riskPerUnit <= 0 || entry <= 0) {
    return { quantity: 0, notional: 0, riskAmount: 0, capped: false };
  }

  const riskBudget = equity * riskPerTrade;
  let qty = riskBudget / riskPerUnit;

  // Spot / no leverage: notional plus the entry fee must fit in cash.
  const maxAffordableQty = cash / (entry * (1 + feeRate));
  let capped = false;
  if (qty > maxAffordableQty) {
    qty = maxAffordableQty;
    capped = true;
  }

  qty = roundQty(Math.max(qty, 0));
  return {
    quantity: qty,
    notional: qty * entry,
    riskAmount: qty * riskPerUnit,
    capped,
  };
}

export interface GateResult {
  ok: boolean;
  reason?: string;
}

const WEEK_SEC = 7 * 24 * 60 * 60;

/** Count entry fills within the trailing `windowSec` seconds of `nowSec`. */
export function countEntries(fills: Fill[], nowSec: number, windowSec: number): number {
  const cutoff = nowSec - windowSec;
  return fills.filter((f) => f.reason === "entry" && f.timestamp >= cutoff).length;
}

/**
 * Decide whether a new entry is permitted right now. Pure: caller supplies the
 * live numbers. `realizedPnlToday` is negative when down on the day.
 */
export function entryGate(params: {
  cfg: AppConfig;
  hasOpenPosition: boolean;
  halted: boolean;
  equity: number;
  realizedPnlToday: number;
  fills: Fill[];
  nowSec: number;
}): GateResult {
  const { cfg, hasOpenPosition, halted, equity, realizedPnlToday, fills, nowSec } =
    params;

  if (halted) return { ok: false, reason: "bot is halted (kill switch)" };
  if (hasOpenPosition) return { ok: false, reason: "a position is already open" };

  const dailyLossLimit = equity * cfg.dailyLossLimitPct;
  if (realizedPnlToday <= -dailyLossLimit) {
    return {
      ok: false,
      reason: `daily loss limit hit (${realizedPnlToday.toFixed(2)} ≤ -${dailyLossLimit.toFixed(2)})`,
    };
  }

  const weekly = countEntries(fills, nowSec, WEEK_SEC);
  if (weekly >= cfg.maxTradesPerWeek) {
    return {
      ok: false,
      reason: `weekly trade cap reached (${weekly}/${cfg.maxTradesPerWeek})`,
    };
  }

  return { ok: true };
}
