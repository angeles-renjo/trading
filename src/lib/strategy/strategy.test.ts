import { describe, it, expect } from "vitest";
import { detectZones, nearestSupportBelow, nearestResistanceAbove } from "./support-resistance";
import { detectSetup, setupParamsFromConfig } from "./index";
import { findPivots, atr } from "../indicators";
import { buildBounceSeries, testConfig } from "../test-utils";

const cfg = testConfig();

describe("indicators", () => {
  it("finds pivot highs and lows", () => {
    const series = buildBounceSeries();
    const pivots = findPivots(series, 3, 3);
    expect(pivots.some((p) => p.kind === "low")).toBe(true);
    expect(pivots.some((p) => p.kind === "high")).toBe(true);
  });

  it("computes ATR as positive numbers once warmed up", () => {
    const series = buildBounceSeries();
    const a = atr(series, 14);
    const last = a[a.length - 1];
    expect(last).toBeGreaterThan(0);
  });
});

describe("support/resistance", () => {
  const series = buildBounceSeries({ S: 10_000, R: 11_000 });
  const zones = detectZones(series, {
    pivotLookback: cfg.pivotLookback,
    zoneWidthPct: cfg.zoneWidthPct,
    minTouches: cfg.minTouches,
  });

  it("detects a strong support zone near S and resistance near R", () => {
    const price = series[series.length - 1].close;
    const support = nearestSupportBelow(zones, price);
    const resistance = nearestResistanceAbove(zones, price);
    expect(support).not.toBeNull();
    expect(resistance).not.toBeNull();
    expect(support!.center).toBeGreaterThan(9_800);
    expect(support!.center).toBeLessThan(10_200);
    expect(support!.touches).toBeGreaterThanOrEqual(3);
    expect(resistance!.center).toBeGreaterThan(10_800);
  });
});

describe("setup detection", () => {
  it("emits an A+ long plan with ~2:1 reward:risk on a confirmed bounce", () => {
    const series = buildBounceSeries({ S: 10_000, R: 11_000 });
    const plan = detectSetup(series, setupParamsFromConfig(cfg));
    expect(plan).not.toBeNull();
    expect(plan!.side).toBe("long");
    expect(plan!.grade).toBe("A+");
    expect(plan!.stop).toBeLessThan(plan!.entry);
    expect(plan!.target).toBeGreaterThan(plan!.entry);
    // target is 2x the stop distance
    const risk = plan!.entry - plan!.stop;
    const reward = plan!.target! - plan!.entry;
    expect(reward / risk).toBeCloseTo(2, 1);
  });

  it("returns null when price is not reacting at support", () => {
    const series = buildBounceSeries();
    // Overwrite the last candle with a mid-range, non-bounce candle.
    const last = series[series.length - 1];
    series[series.length - 1] = {
      ...last,
      open: 10_500,
      high: 10_550,
      low: 10_480,
      close: 10_520,
    };
    const plan = detectSetup(series, setupParamsFromConfig(cfg));
    expect(plan).toBeNull();
  });
});
