import "../src/lib/load-env";
import { getConfig } from "../src/lib/config";
import { getMarketData } from "../src/lib/exchange";
import { runBacktest } from "../src/lib/backtest/backtester";
import { fmtPct, fmtNum } from "../src/lib/format";
import type { SetupGrade } from "../src/lib/types";

// Parameter-robustness sweep for the trend strategy. Runs a grid of
// (donchianN × trendMaPeriod × atrMult) over the SAME candles and reports how
// many combos stay profitable — a fragile edge collapses on small changes; a
// real one survives most of the grid.
//
// Usage:
//   npm run sweep -- 8000 A
//   npx tsx scripts/sweep.ts 8000 A

const DONCHIANS = [15, 20, 30];
const MAS = [50, 100, 150];
const ATRS = [2, 3, 4];

async function main() {
  const cfg = getConfig();
  const argv = process.argv.slice(2);
  const bars = Number(argv.find((a) => /^\d+$/.test(a))) || 8000;
  const grade = ((argv.find((a) => /^(A\+|A|B)$/i.test(a)) || cfg.minGrade).toUpperCase() as SetupGrade);
  const interval = cfg.primaryInterval;

  console.log("Crypto Trading Partner — Parameter Sweep (trend)\n" + "=".repeat(64));
  console.log(`Fetching ${bars} ${interval} candles for ${cfg.symbol}…`);
  const candles = await getMarketData().getHistory(cfg.symbol, interval, bars);
  if (candles.length < 200) {
    console.error(`Not enough candles (${candles.length}).`);
    process.exit(1);
  }
  console.log(
    `Grid: ${DONCHIANS.length}×${MAS.length}×${ATRS.length} = ` +
      `${DONCHIANS.length * MAS.length * ATRS.length} combos, grade ${grade}+\n`,
  );

  type Row = { d: number; m: number; a: number; ret: number; pf: number; wr: number; dd: number; n: number };
  const rows: Row[] = [];

  for (const d of DONCHIANS) {
    for (const m of MAS) {
      for (const a of ATRS) {
        const c = { ...cfg, strategy: "trend" as const, primaryInterval: interval, donchianN: d, trendMaPeriod: m, atrMult: a };
        const r = runBacktest(candles, c, { minGrade: grade });
        rows.push({ d, m, a, ret: r.returnPct, pf: r.profitFactor, wr: r.winRate, dd: r.maxDrawdownPct, n: r.totalTrades });
      }
    }
  }

  rows.sort((x, y) => y.ret - x.ret);

  const pf = (v: number) => (Number.isFinite(v) ? fmtNum(v, 2) : "∞");
  console.log(
    "Donch  MA  ATR │   Return    PF    Win%   MaxDD  Trades",
  );
  console.log("─".repeat(64));
  for (const r of rows) {
    console.log(
      `${String(r.d).padStart(4)} ${String(r.m).padStart(4)} ${String(r.a).padStart(4)}  │ ` +
        `${fmtPct(r.ret).padStart(8)}  ${pf(r.pf).padStart(5)}  ${fmtPct(r.wr, 0).padStart(5)}  ` +
        `${fmtPct(r.dd, 0).padStart(5)}  ${String(r.n).padStart(5)}`,
    );
  }

  const profitable = rows.filter((r) => r.ret > 0).length;
  const pct = profitable / rows.length;
  const medRet = [...rows].sort((a, b) => a.ret - b.ret)[Math.floor(rows.length / 2)].ret;
  const avgDd = rows.reduce((s, r) => s + r.dd, 0) / rows.length;

  console.log("\n" + "=".repeat(64));
  console.log(`Profitable combos : ${profitable}/${rows.length}  (${fmtPct(pct, 0)})`);
  console.log(`Median return     : ${fmtPct(medRet)}`);
  console.log(`Average max DD    : ${fmtPct(avgDd, 1)}`);
  const verdict =
    pct >= 0.7 ? "ROBUST — edge survives most parameter changes."
    : pct >= 0.4 ? "MIXED — edge exists but is parameter-sensitive; be cautious."
    : "FRAGILE — edge depends on specific params; likely overfit. Do NOT trade.";
  console.log(`Verdict           : ${verdict}`);
}

main().catch((e) => {
  console.error("Sweep failed:", e);
  process.exit(1);
});
