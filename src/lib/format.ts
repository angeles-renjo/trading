// Display formatting helpers shared by the CLI and the web dashboard.

export function fmtUsd(n: number, dp = 2): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

export function fmtSignedUsd(n: number, dp = 2): string {
  const s = fmtUsd(Math.abs(n), dp);
  return n < 0 ? `-${s}` : `+${s}`;
}

export function fmtPct(frac: number, dp = 2): string {
  const v = frac * 100;
  return `${v >= 0 ? "+" : ""}${v.toFixed(dp)}%`;
}

export function fmtNum(n: number, dp = 2): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Convert a USD amount to NZD for display (rate = NZD per 1 USD). */
export function toNzd(usd: number, nzdPerUsd: number): number {
  return usd * nzdPerUsd;
}

export function fmtDateTime(epochSec: number): string {
  return new Date(epochSec * 1000).toISOString().replace("T", " ").slice(0, 16);
}
