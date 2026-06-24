import { describe, it, expect } from "vitest";
import { TrendStrategy } from "./trend-strategy";
import { runBacktest } from "../backtest/backtester";
import { buildTrendSeries, testConfig } from "../test-utils";

const cfg = testConfig({ strategy: "trend", minGrade: "B" });

describe("TrendStrategy", () => {
  const series = buildTrendSeries({ n: 300 });
  const strat = new TrendStrategy();

  it("enters a breakout in an uptrend with an ATR stop and no fixed target", () => {
    const plan = strat.evaluateEntry(series, cfg);
    expect(plan).not.toBeNull();
    expect(plan!.strategy).toBe("trend");
    expect(plan!.target).toBeNull();
    expect(plan!.stop).toBeLessThan(plan!.entry);
    expect(plan!.side).toBe("long");
  });

  it("does not enter in a downtrend", () => {
    // Reverse price order while keeping ascending timestamps -> a downtrend.
    const down = series
      .map((_, i) => series[series.length - 1 - i])
      .map((c, i) => ({ ...c, time: series[i].time }));
    expect(strat.evaluateEntry(down, cfg)).toBeNull();
  });

  it("trails the stop upward as price rises", () => {
    const mid = Math.floor(series.length / 2);
    const ctx = { entryTime: series[mid].time, entry: series[mid].close, stop: 0 };
    const early = strat.trailStop(series.slice(0, Math.floor(series.length * 0.7)), ctx, cfg);
    const late = strat.trailStop(series, ctx, cfg);
    expect(early).not.toBeNull();
    expect(late).not.toBeNull();
    expect(late!).toBeGreaterThan(early!);
  });
});

describe("backtest (trend) on a clean uptrend", () => {
  it("takes trades and ends profitable", () => {
    const r = runBacktest(buildTrendSeries({ n: 400 }), cfg, { minGrade: "B" });
    expect(r.strategy).toBe("trend");
    expect(r.totalTrades).toBeGreaterThanOrEqual(1);
    expect(r.netPnl).toBeGreaterThan(0);
  });
});
