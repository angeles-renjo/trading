import { describe, it, expect } from "vitest";
import { TradingEngine } from "./engine";
import { PaperBroker } from "../exchange/paper-broker";
import {
  MemoryStorage,
  StubMarketData,
  buildBounceSeries,
  testConfig,
} from "../test-utils";

const cfg = testConfig();

function makeEngine(price?: number) {
  const candles = buildBounceSeries({ S: 10_000, R: 11_000 });
  const md = new StubMarketData(candles, price);
  const broker = new PaperBroker(md, cfg);
  const storage = new MemoryStorage(cfg);
  const engine = new TradingEngine({ cfg, md, broker, storage });
  return { engine, md, storage };
}

describe("TradingEngine (paper) full cycle", () => {
  it("enters an A+ setup, then exits at target with a net profit", async () => {
    const { engine, md, storage } = makeEngine();

    // 1) First tick: should enter on the confirmed bounce.
    const enter = await engine.tick();
    expect(enter.action).toBe("entered");

    const afterEntry = await storage.load();
    expect(afterEntry.position).not.toBeNull();
    expect(afterEntry.fills.filter((f) => f.reason === "entry")).toHaveLength(1);
    const pos = afterEntry.position!;
    expect(pos.stop).toBeLessThan(pos.avgPrice);
    expect(pos.target!).toBeGreaterThan(pos.avgPrice);

    // 2) Price drifts up to the target -> exit.
    md.price = pos.target! + 1;
    const exit = await engine.tick();
    expect(exit.action).toBe("exited");

    const afterExit = await storage.load();
    expect(afterExit.position).toBeNull();
    const sell = afterExit.fills.find((f) => f.reason === "target");
    expect(sell).toBeDefined();
    expect(sell!.realizedPnl!).toBeGreaterThan(0);
    expect(afterExit.cash).toBeGreaterThan(cfg.startingBalance);
  });

  it("exits at the stop for a loss when price falls through it", async () => {
    const { engine, md, storage } = makeEngine();
    await engine.tick(); // enter
    const pos = (await storage.load()).position!;

    md.price = pos.stop - 1;
    const exit = await engine.tick();
    expect(exit.action).toBe("exited");

    const afterExit = await storage.load();
    expect(afterExit.position).toBeNull();
    const sell = afterExit.fills.find((f) => f.reason === "stop");
    expect(sell!.realizedPnl!).toBeLessThan(0);
    expect(afterExit.cash).toBeLessThan(cfg.startingBalance);
  });

  it("does not open a second position while one is open", async () => {
    const { engine, storage } = makeEngine();
    await engine.tick(); // enter
    const r2 = await engine.tick(); // holding (price unchanged, within band)
    expect(r2.action).toBe("none");
    const state = await storage.load();
    expect(state.fills.filter((f) => f.reason === "entry")).toHaveLength(1);
  });

  it("respects the halt kill switch", async () => {
    const { engine, storage } = makeEngine();
    const s = await storage.load();
    s.halted = true;
    await storage.save(s);
    const r = await engine.tick();
    expect(r.action).toBe("blocked");
    expect((await storage.load()).position).toBeNull();
  });
});
