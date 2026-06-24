import { readFileSync } from "node:fs";
import type { Candle } from "../types";

// ---------------------------------------------------------------------------
// Load candles from a CSV for fully-offline backtests.
// Expected columns (header optional, in this order):
//   time,open,high,low,close,volume
// `time` may be unix seconds, unix milliseconds, or an ISO date string.
// ---------------------------------------------------------------------------

function parseTime(raw: string): number {
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n > 1e12) return Math.floor(n / 1000); // ms
    return Math.floor(n); // seconds
  }
  const parsed = Date.parse(raw);
  if (Number.isNaN(parsed)) throw new Error(`Unparseable time: ${raw}`);
  return Math.floor(parsed / 1000);
}

export function loadCandlesFromCsv(file: string): Candle[] {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Skip a header row if the first field isn't a number/date.
  const first = lines[0].split(",")[0].trim().toLowerCase();
  const start = first === "time" || first === "date" || first === "timestamp" ? 1 : 0;

  const candles: Candle[] = [];
  for (let i = start; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 6) continue;
    candles.push({
      time: parseTime(cols[0]),
      open: Number(cols[1]),
      high: Number(cols[2]),
      low: Number(cols[3]),
      close: Number(cols[4]),
      volume: Number(cols[5]),
    });
  }
  candles.sort((a, b) => a.time - b.time);
  return candles;
}
