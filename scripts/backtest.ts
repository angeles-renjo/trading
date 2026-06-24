import "../src/lib/load-env";
import { getConfig } from "../src/lib/config";
import { getMarketData } from "../src/lib/exchange";
import { runBacktest } from "../src/lib/backtest/backtester";
import { loadCandlesFromCsv } from "../src/lib/backtest/csv";
import { fmtUsd, fmtPct, fmtNum, fmtDateTime } from "../src/lib/format";
import type { SetupGrade } from "../src/lib/types";
import type { StrategyName } from "../src/lib/config";

// Usage (flags OR bare positional args — both work, order-independent):
//   npm run backtest -- trend 4400 A
//   npm run backtest -- --strategy sr --bars 4400 --grade A
//   npx tsx scripts/backtest.ts trend 4400 A
//   npm run backtest -- data.csv trend A
//
// Recognised positionals: a number -> bars, A+/A/B -> grade,
// trend/sr -> strategy, an interval code (60/240/D...) -> interval,
// *.csv -> csv file.

const INTERVAL_CODES = new Set([
  "1", "3", "5", "15", "30", "60", "120", "240", "360", "720", "D", "W", "M",
]);

interface Args {
  bars?: number;
  grade?: SetupGrade;
  interval?: string;
  strategy?: StrategyName;
  csv?: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { json: false };
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") out.json = true;
    else if (a === "--bars") out.bars = Number(argv[++i]);
    else if (a === "--grade") out.grade = argv[++i] as SetupGrade;
    else if (a === "--interval") out.interval = argv[++i];
    else if (a === "--strategy") out.strategy = argv[++i] as StrategyName;
    else if (a === "--csv") out.csv = argv[++i];
    else if (a.startsWith("--")) {
      /* ignore unknown flag */
    } else positional.push(a);
  }

  for (const p of positional) {
    const upper = p.toUpperCase();
    if (/^\d+$/.test(p)) {
      out.bars ??= Number(p);
    } else if (upper === "A+" || upper === "A" || upper === "B") {
      out.grade ??= upper as SetupGrade;
    } else if (p.toLowerCase() === "trend" || p.toLowerCase() === "sr") {
      out.strategy ??= p.toLowerCase() as StrategyName;
    } else if (INTERVAL_CODES.has(upper)) {
      out.interval ??= upper === "D" || upper === "W" || upper === "M" ? upper : p;
    } else if (p.toLowerCase().endsWith(".csv")) {
      out.csv ??= p;
    }
  }

  return out;
}

async function main() {
  const baseCfg = getConfig();
  const args = parseArgs(process.argv.slice(2));

  const interval = args.interval ?? baseCfg.primaryInterval;
  const bars = args.bars ?? 3000;
  const grade = args.grade ?? baseCfg.minGrade;
  const strategy = args.strategy ?? baseCfg.strategy;
  const cfg = { ...baseCfg, primaryInterval: interval, strategy };

  console.log("Crypto Trading Partner — Backtest\n" + "=".repeat(60));

  const candles = args.csv
    ? loadCandlesFromCsv(args.csv)
    : await getMarketData().getHistory(cfg.symbol, interval, bars);

  if (candles.length < 60) {
    console.error(
      `Not enough candles (${candles.length}). ` +
        (args.csv ? "Check the CSV." : "Bybit may be unreachable — try MARKET_DATA_SOURCE=mock or a CSV."),
    );
    process.exit(1);
  }

  const r = runBacktest(candles, cfg, { minGrade: grade });

  if (args.json) {
    console.log(JSON.stringify(r, null, 2));
    return;
  }

  const span = `${fmtDateTime(r.from)} → ${fmtDateTime(r.to)} (${r.bars} ${interval} candles)`;
  const rows: Array<[string, string]> = [
    ["Symbol / source", `${cfg.symbol} / ${args.csv ? "csv" : cfg.marketDataSource}`],
    ["Strategy", r.strategy],
    ["Period", span],
    ["Min grade", `${grade} or better`],
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
    console.log("  (no trades — try a longer window, a lower grade, or check the data source.)");
  }
}

main().catch((e) => {
  console.error("Backtest failed:", e);
  process.exit(1);
});
