// Bybit V5 kline interval codes -> seconds.
// Valid codes: 1 3 5 15 30 60 120 240 360 720 (minutes), D, W, M.

const MINUTE = 60;
const MAP: Record<string, number> = {
  "1": 1 * MINUTE,
  "3": 3 * MINUTE,
  "5": 5 * MINUTE,
  "15": 15 * MINUTE,
  "30": 30 * MINUTE,
  "60": 60 * MINUTE,
  "120": 120 * MINUTE,
  "240": 240 * MINUTE,
  "360": 360 * MINUTE,
  "720": 720 * MINUTE,
  D: 24 * 60 * MINUTE,
  W: 7 * 24 * 60 * MINUTE,
  M: 30 * 24 * 60 * MINUTE,
};

export function intervalToSeconds(interval: string): number {
  const s = MAP[interval];
  if (!s) throw new Error(`Unsupported interval: ${interval}`);
  return s;
}

export function isValidInterval(interval: string): boolean {
  return interval in MAP;
}
