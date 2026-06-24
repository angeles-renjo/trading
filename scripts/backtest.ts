import "../src/lib/load-env";
import { getConfig } from "../src/lib/config";
import { getMarketData } from "../src/lib/exchange";
import { runBacktest } from "../src/lib/backtest/backtester";
import { loadCandlesFromCsv } from "../src/lib/backtest/csv";
import { fmtUsd, fmtPct, fmtNum, fmtDateTime } from "../src/lib/format";
import type { SetupGrade } from "../src/lib/types";

// Usage:
//   npm run backtest -- [--bars 1500] [--interval 240] [--grade A+] [--csv path] [--json]

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : fallback;
}
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const cfg = getConfig();
  const interval = arg("interval", cfg.primaryInterval)!;
  const bars = Number(arg("bars", "1500"));
  const grade = arg("grade", cfg.minGrade) as SetupGrade;
  const csv = arg("csv");

  console.log("Crypto Trading Partner — Backtest\n" + "=".repeat(60));

  const candles = csv
    ? loadCandlesFromCsv(csv)
    : await getMarketData().getHistory(cfg.symbol, interval, bars);

  if (candles.length < 60) {
    console.error(
      `Not enough candles (${candles.length}). ` +
        (csv ? "Check the CSV." : "Bybit may be unreachable — try MARKET_DATA_SOURCE=mock or --csv."),
    );
    process.exit(1);
  }

  const r = runBacktest(candles, cfg, { minGrade: grade });

  if (hasFlag("json")) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  const span = `${fmtDateTime(r.from)} → ${fmtDateTime(r.to)} (${r.bars} ${interval} candles)`;
  const rows: Array<[string, string]> = [
    ["Symbol / source", `${cfg.symbol} / ${csv ? "csv" : cfg.marketDataSource}`],
    ["Strategy", r.strategy],
    ["Period", span],
    ["Grade filter", `${grade}+`],
    ["Starting balance", fmtUsd(r.startingBalance)],
    ["Ending equity", fmtUsd(r.endingEquity)],
    ["Net P&L", `${fmtUsd(r.netPnl)}  (${fmtPct(r.returnPct)})`],
    ["Trades", `${r.totalTrades}  (W ${r.wins} / L ${r.losses})`],
    ["Win rate", fmtPct(r.winRate, 1)],
    ["Profit factor", Number.isFinite(r.profitFactor) ? fmtNum(r.profitFactor) : "∞"],
    ["Expectancy / trade", `${fmtUsd(r.expectancy)}  (${fmtNum(r.avgR)}R)`],
    ["Avg win / loss", `${fmtUsd(r.avgWin)} / ${fmtUsd(r.avgLoss)}`],
    ["Max drawdown", fmtPct(r.maxDrawdownPct, 1)],
    ["Avg bars held", fmtNum(r.avgBarsHeld, 1)],
    ["Fee / side", fmtPct(r.feeRate, 3)],
  ];
  for (const [k, v] of rows) console.log(k.padEnd(22) + v);

  console.log("\nLast trades:");
  for (const t of r.trades.slice(-8)) {
    const tag = t.pnl >= 0 ? "WIN " : "LOSS";
    console.log(
      `  ${fmtDateTime(t.entryTime)}  ${t.grade.padEnd(2)} ${tag} ` +
        `entry ${fmtNum(t.entry)} exit ${fmtNum(t.exit)} (${t.outcome}) ` +
        `${fmtUsd(t.pnl)} ${fmtNum(t.r)}R`,
    );
  }
  if (r.totalTrades === 0) {
    console.log("  (no trades — try a longer --bars window, lower --grade, or MIN_TOUCHES.)");
  }
}

main().catch((e) => {
  console.error("Backtest failed:", e);
  process.exit(1);
});
