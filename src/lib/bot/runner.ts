import type { AppConfig } from "../config";
import { createWiring } from "../trading/factory";

// ---------------------------------------------------------------------------
// The bot loop. Calls engine.tick() every pollIntervalSec. Entry/exit
// notifications come from the engine; here we log the cycle outcome, survive
// transient errors, and shut down cleanly on SIGINT/SIGTERM.
// ---------------------------------------------------------------------------

export interface RunOptions {
  once?: boolean;
  intervalSec?: number;
}

function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Sleep that wakes early when `shouldStop()` becomes true. */
async function interruptibleSleep(ms: number, shouldStop: () => boolean): Promise<void> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (shouldStop()) return;
    await new Promise((r) => setTimeout(r, Math.min(1000, end - Date.now())));
  }
}

export async function runBot(cfg: AppConfig, opts: RunOptions = {}): Promise<void> {
  const { engine, notifier, live } = createWiring(cfg);
  const intervalSec = opts.intervalSec ?? cfg.pollIntervalSec;

  await notifier.notify({
    type: live ? "error" : "info", // surface LIVE prominently
    time: now(),
    message:
      `Bot starting — mode=${live ? "🔴 LIVE (real money)" : "📝 paper"}, ` +
      `data=${cfg.marketDataSource}, symbol=${cfg.symbol}, tf=${cfg.primaryInterval}, ` +
      `risk=${(cfg.riskPerTrade * 100).toFixed(2)}%/trade, RR=${cfg.riskReward}:1, ` +
      `minGrade=${cfg.minGrade}, weeklyCap=${cfg.maxTradesPerWeek}`,
  });

  let stop = false;
  const shutdown = () => {
    stop = true;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  do {
    try {
      const r = await engine.tick();
      if (r.action === "blocked") {
        console.log(`⛔ ${r.detail}`);
      } else if (r.action === "none") {
        console.log(`· ${r.detail}`);
      }
      // entry/exit are announced by the engine's notifier.
    } catch (err) {
      await notifier.notify({
        type: "error",
        time: now(),
        message: `tick failed: ${(err as Error).message}`,
      });
    }

    if (opts.once || stop) break;
    await interruptibleSleep(intervalSec * 1000, () => stop);
  } while (!stop);

  await notifier.notify({ type: "info", time: now(), message: "Bot stopped." });
}
