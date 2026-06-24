import { describe, it, expect } from "vitest";
import { recordEntry, recordExit, valueAccount } from "./account";
import { sizePosition, entryGate, countEntries } from "./risk";
import { createFreshAccount } from "../storage/file-store";
import { testConfig } from "../test-utils";
import type { OrderResult } from "../exchange/types";

const cfg = testConfig();

function order(side: "buy" | "sell", qty: number, price: number, ts = 1_700_000_000): OrderResult {
  return {
    orderId: `${side}-${ts}-${price}`,
    symbol: cfg.symbol,
    side,
    quantity: qty,
    price,
    fee: qty * price * cfg.feeRate,
    timestamp: ts,
  };
}

describe("position sizing", () => {
  it("risks the configured fraction of equity per trade", () => {
    const size = sizePosition({
      equity: 10_000,
      cash: 10_000,
      riskPerTrade: 0.01,
      entry: 100,
      stop: 95,
      feeRate: 0.001,
    });
    // risk budget = 100; risk/unit = 5 -> qty ~ 20; notional ~ 2000
    expect(size.riskAmount).toBeCloseTo(100, 0);
    expect(size.quantity).toBeCloseTo(20, 1);
    expect(size.capped).toBe(false);
  });

  it("caps size to available cash (no leverage on spot)", () => {
    const size = sizePosition({
      equity: 10_000,
      cash: 500,
      riskPerTrade: 0.01,
      entry: 100,
      stop: 99, // tiny stop -> huge unconstrained size
      feeRate: 0.001,
    });
    expect(size.capped).toBe(true);
    expect(size.notional).toBeLessThanOrEqual(500);
  });
});

describe("account P&L", () => {
  it("records a winning round-trip net of fees", () => {
    const state = createFreshAccount(cfg);
    recordEntry(state, order("buy", 1, 10_000), 9_900, 10_200);
    expect(state.position).not.toBeNull();
    // cash reduced by notional + fee
    expect(state.cash).toBeCloseTo(10_000 - 10_000 - 10, 2);

    const { realizedPnl } = recordExit(state, order("sell", 1, 10_200), "target");
    expect(state.position).toBeNull();
    // gross +200, minus ~10 entry fee and ~10.2 exit fee
    expect(realizedPnl).toBeGreaterThan(170);
    expect(realizedPnl).toBeLessThan(200);
    expect(state.realizedPnlToday).toBeCloseTo(realizedPnl, 2);
    // back to ~ starting balance + pnl
    expect(state.cash).toBeCloseTo(10_000 + realizedPnl, 1);
  });

  it("records a losing trade as negative", () => {
    const state = createFreshAccount(cfg);
    recordEntry(state, order("buy", 1, 10_000), 9_900, 10_200);
    const { realizedPnl } = recordExit(state, order("sell", 1, 9_900), "stop");
    expect(realizedPnl).toBeLessThan(0);
  });

  it("values an open position with unrealized P&L", () => {
    const state = createFreshAccount(cfg);
    recordEntry(state, order("buy", 1, 10_000), 9_900, 10_200);
    const v = valueAccount(state, 10_100);
    expect(v.positionValue).toBeCloseTo(10_100, 2);
    expect(v.unrealizedPnl).toBeCloseTo(100, 2);
  });
});

describe("entry gating", () => {
  it("blocks when halted", () => {
    const r = entryGate({
      cfg,
      hasOpenPosition: false,
      halted: true,
      equity: 10_000,
      realizedPnlToday: 0,
      fills: [],
      nowSec: 1_700_000_000,
    });
    expect(r.ok).toBe(false);
  });

  it("blocks when the daily loss limit is hit", () => {
    const r = entryGate({
      cfg,
      hasOpenPosition: false,
      halted: false,
      equity: 10_000,
      realizedPnlToday: -700, // > 6% of 10k
      fills: [],
      nowSec: 1_700_000_000,
    });
    expect(r.ok).toBe(false);
  });

  it("blocks when the weekly trade cap is reached", () => {
    const now = 1_700_000_000;
    const fills = Array.from({ length: 3 }, (_, i) => ({
      id: `e${i}`,
      symbol: cfg.symbol,
      side: "buy" as const,
      quantity: 1,
      price: 100,
      notional: 100,
      fee: 0.1,
      timestamp: now - i * 1000,
      reason: "entry" as const,
    }));
    expect(countEntries(fills, now, 7 * 24 * 3600)).toBe(3);
    const r = entryGate({
      cfg,
      hasOpenPosition: false,
      halted: false,
      equity: 10_000,
      realizedPnlToday: 0,
      fills,
      nowSec: now,
    });
    expect(r.ok).toBe(false);
  });
});
