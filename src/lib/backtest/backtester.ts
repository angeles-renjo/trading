import type { AppConfig } from "../config";
import type { Candle, SetupGrade } from "../types";
import { getStrategy, gradeAtLeast } from "../strategy";
import { sizePosition } from "../trading/risk";
import { round, roundPrice } from "../num";

// ---------------------------------------------------------------------------
// Event-driven backtester.
//
// Walks the candle series bar by bar. At each closed bar it asks the configured
// strategy for an entry; on a qualifying grade it enters at that bar's close
// (executable in practice — the close is known when the bar closes, so this is
// not lookahead). Open positions are managed against each subsequent bar's
// high/low: stop, then fixed target (if any), otherwise the stop is trailed.
// Slippage is not modelled; a bar straddling both stop and target assumes the
// stop fills first (conservative). R multiples use the INITIAL stop.
// ---------------------------------------------------------------------------

export interface BacktestTrade {
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  stop: number; // initial stop
  target: number | null;
  quantity: number;
  grade: SetupGrade;
  pnl: number;
  returnPct: number;
  r: number;
  outcome: "target" | "stop" | "open";
  barsHeld: number;
  reason: string;
}

export interface EquityPoint {
  time: number;
  equity: number;
}

export interface BacktestResult {
  symbol: string;
  strategy: string;
  interval: string;
  from: number;
  to: number;
  bars: number;
  startingBalance: number;
  endingEquity: number;
  netPnl: number;
  returnPct: number;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  expectancy: number;
  avgR: number;
  maxDrawdownPct: number;
  avgBarsHeld: number;
  feeRate: number;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
}

export interface BacktestOptions {
  minGrade?: SetupGrade;
  warmup?: number;
}

interface OpenPosition {
  entryTime: number;
  entryIndex: number;
  entry: number;
  stop: number; // current (possibly trailed) stop
  initialStop: number;
  target: number | null;
  qty: number;
  entryNotional: number;
  entryFee: number;
  grade: SetupGrade;
  reason: string;
}

export function runBacktest(
  candles: Candle[],
  cfg: AppConfig,
  opts: BacktestOptions = {},
): BacktestResult {
  const minGrade: SetupGrade = opts.minGrade ?? cfg.minGrade;
  const warmup = opts.warmup ?? Math.max(cfg.trendMaPeriod + 12, cfg.pivotLookback * 2 + 5, 50);
  const strat = getStrategy(cfg);
  const feeRate = cfg.feeRate;

  let cash = cfg.startingBalance;
  let position: OpenPosition | null = null;
  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  const closeTrade = (
    exitPrice: number,
    exitTime: number,
    exitIndex: number,
    outcome: BacktestTrade["outcome"],
  ) => {
    if (!position) return;
    const exitNotional = position.qty * exitPrice;
    const exitFee = exitNotional * feeRate;
    cash += exitNotional - exitFee;
    const pnl = exitNotional - exitFee - position.entryNotional - position.entryFee;
    const risked = position.qty * (position.entry - position.initialStop);
    trades.push({
      entryTime: position.entryTime,
      exitTime,
      entry: position.entry,
      exit: roundPrice(exitPrice),
      stop: position.initialStop,
      target: position.target,
      quantity: position.qty,
      grade: position.grade,
      pnl: round(pnl, 2),
      returnPct: round(pnl / position.entryNotional, 4),
      r: risked > 0 ? round(pnl / risked, 2) : 0,
      outcome,
      barsHeld: exitIndex - position.entryIndex,
      reason: position.reason,
    });
    position = null;
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // (1) Manage an open position against this bar.
    if (position) {
      if (c.low <= position.stop) {
        closeTrade(position.stop, c.time, i, "stop");
      } else if (position.target != null && c.high >= position.target) {
        closeTrade(position.target, c.time, i, "target");
      } else if (strat.trailStop) {
        const ns = strat.trailStop(
          candles.slice(0, i + 1),
          { entryTime: position.entryTime, entry: position.entry, stop: position.stop },
          cfg,
        );
        if (ns != null && ns > position.stop) position.stop = ns;
      }
    }

    // (2) Look for a new entry (only when flat and past warmup).
    if (!position && i >= warmup && i < candles.length - 1) {
      const plan = strat.evaluateEntry(candles.slice(0, i + 1), cfg);
      if (plan && gradeAtLeast(plan.grade, minGrade)) {
        const size = sizePosition({
          equity: cash,
          cash,
          riskPerTrade: cfg.riskPerTrade,
          entry: plan.entry,
          stop: plan.stop,
          feeRate,
        });
        if (size.quantity > 0 && size.notional > 0) {
          const entryNotional = size.quantity * plan.entry;
          const entryFee = entryNotional * feeRate;
          cash -= entryNotional + entryFee;
          position = {
            entryTime: plan.time,
            entryIndex: i,
            entry: plan.entry,
            stop: plan.stop,
            initialStop: plan.stop,
            target: plan.target,
            qty: size.quantity,
            entryNotional,
            entryFee,
            grade: plan.grade,
            reason: plan.reason,
          };
        }
      }
    }

    // (3) Mark equity to close.
    const markValue = position ? position.qty * c.close : 0;
    equityCurve.push({ time: c.time, equity: round(cash + markValue, 2) });
  }

  if (position && candles.length > 0) {
    const last = candles[candles.length - 1];
    closeTrade(last.close, last.time, candles.length - 1, "open");
  }

  return summarise(candles, cfg, strat.name, feeRate, cash, trades, equityCurve);
}

function summarise(
  candles: Candle[],
  cfg: AppConfig,
  strategyName: string,
  feeRate: number,
  endingCash: number,
  trades: BacktestTrade[],
  equityCurve: EquityPoint[],
): BacktestResult {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const netPnl = endingCash - cfg.startingBalance;

  let peak = -Infinity;
  let maxDd = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = (peak - p.equity) / peak;
      if (dd > maxDd) maxDd = dd;
    }
  }

  const sumR = trades.reduce((s, t) => s + t.r, 0);
  const sumBars = trades.reduce((s, t) => s + t.barsHeld, 0);

  return {
    symbol: cfg.symbol,
    strategy: strategyName,
    interval: cfg.primaryInterval,
    from: candles[0]?.time ?? 0,
    to: candles[candles.length - 1]?.time ?? 0,
    bars: candles.length,
    startingBalance: cfg.startingBalance,
    endingEquity: round(endingCash, 2),
    netPnl: round(netPnl, 2),
    returnPct: round(netPnl / cfg.startingBalance, 4),
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? round(wins.length / trades.length, 4) : 0,
    grossProfit: round(grossProfit, 2),
    grossLoss: round(grossLoss, 2),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 2) : grossProfit > 0 ? Infinity : 0,
    avgWin: wins.length ? round(grossProfit / wins.length, 2) : 0,
    avgLoss: losses.length ? round(grossLoss / losses.length, 2) : 0,
    expectancy: trades.length ? round(netPnl / trades.length, 2) : 0,
    avgR: trades.length ? round(sumR / trades.length, 2) : 0,
    maxDrawdownPct: round(maxDd, 4),
    avgBarsHeld: trades.length ? round(sumBars / trades.length, 1) : 0,
    feeRate,
    trades,
    equityCurve,
  };
}
