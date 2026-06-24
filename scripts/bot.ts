import "../src/lib/load-env";
import { getConfig, isLiveTradingEnabled } from "../src/lib/config";
import { runBot } from "../src/lib/bot/runner";

// Usage:
//   npm run bot              # continuous loop
//   npm run bot -- --once    # single decision cycle then exit

async function main() {
  const cfg = getConfig();
  const once = process.argv.includes("--once");

  if (isLiveTradingEnabled(cfg)) {
    console.log(
      "\n⚠️  LIVE TRADING IS ENABLED — this will place REAL orders with REAL money.\n" +
        `    Exchange: ${cfg.bybitBaseUrl}\n` +
        "    Starting in 5s. Press Ctrl+C to abort.\n",
    );
    await new Promise((r) => setTimeout(r, 5000));
  }

  await runBot(cfg, { once });
}

main().catch((e) => {
  console.error("Bot crashed:", e);
  process.exit(1);
});
