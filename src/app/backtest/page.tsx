"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { Panel, Stat, Badge, Button, gradeTone } from "@/components/ui";
import { fmtUsd, fmtPct, fmtNum, fmtDateTime } from "@/lib/format";
import type { BacktestResult } from "@/lib/api/types";

const INTERVALS = [
  { value: "60", label: "1h" },
  { value: "240", label: "4h" },
  { value: "D", label: "1D" },
];
const GRADES = ["A+", "A", "B"];

export default function BacktestPage() {
  const [interval, setTimeframe] = useState("240");
  const [bars, setBars] = useState(1500);
  const [grade, setGrade] = useState("A+");
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const r = await postJson<BacktestResult>("/api/backtest", { interval, bars, grade });
      setResult(r);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-100">Backtest</h1>
      </div>

      <Panel title="Parameters">
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Timeframe">
            <select
              value={interval}
              onChange={(e) => setTimeframe(e.target.value)}
              className="rounded-md border border-line bg-panel-soft px-2 py-1.5 text-sm"
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>
                  {i.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Candles">
            <input
              type="number"
              value={bars}
              min={100}
              max={10000}
              step={100}
              onChange={(e) => setBars(Number(e.target.value))}
              className="w-28 rounded-md border border-line bg-panel-soft px-2 py-1.5 text-sm"
            />
          </Field>
          <Field label="Min grade">
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="rounded-md border border-line bg-panel-soft px-2 py-1.5 text-sm"
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {g}+
                </option>
              ))}
            </select>
          </Field>
          <Button tone="primary" onClick={run} disabled={loading}>
            {loading ? "Running…" : "Run backtest"}
          </Button>
        </div>
        <p className="mt-3 text-xs text-gray-500">
          Pulls historical candles from the configured data source and replays the same
          strategy the bot uses. Needs Bybit reachable (or MARKET_DATA_SOURCE=mock).
        </p>
      </Panel>

      {error && (
        <div className="rounded-lg border border-down/30 bg-down/10 px-4 py-2 text-sm text-down">
          {error}
        </div>
      )}

      {result && <Results r={result} grade={grade} />}
    </div>
  );
}

function Results({ r, grade }: { r: BacktestResult; grade: string }) {
  const tone = r.netPnl >= 0 ? "up" : "down";
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Stat label="Net P&L" value={fmtUsd(r.netPnl)} sub={fmtPct(r.returnPct)} tone={tone} />
        <Stat label="Win rate" value={fmtPct(r.winRate, 1)} sub={`${r.wins}W / ${r.losses}L`} />
        <Stat
          label="Profit factor"
          value={Number.isFinite(r.profitFactor) ? fmtNum(r.profitFactor) : "∞"}
        />
        <Stat
          label="Expectancy"
          value={`${fmtNum(r.avgR)}R`}
          sub={fmtUsd(r.expectancy)}
          tone={r.avgR >= 0 ? "up" : "down"}
        />
        <Stat label="Max drawdown" value={fmtPct(r.maxDrawdownPct, 1)} tone="down" />
        <Stat label="Trades" value={String(r.totalTrades)} sub={`avg ${fmtNum(r.avgBarsHeld, 1)} bars`} />
      </div>

      <Panel
        title="Equity curve"
        actions={
          <Badge tone="neutral">
            {r.strategy} · {grade}+ · {fmtDateTime(r.from)} → {fmtDateTime(r.to)}
          </Badge>
        }
      >
        <EquityCurve points={r.equityCurve} start={r.startingBalance} />
      </Panel>

      <Panel title={`Trades (${r.trades.length})`}>
        {r.trades.length === 0 ? (
          <p className="text-sm text-gray-500">
            No trades for these parameters. Try more candles, a lower grade, or fewer MIN_TOUCHES.
          </p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-panel">
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="py-1 pr-3">Entry time</th>
                  <th className="py-1 pr-3">Grade</th>
                  <th className="py-1 pr-3 text-right">Entry</th>
                  <th className="py-1 pr-3 text-right">Exit</th>
                  <th className="py-1 pr-3">Outcome</th>
                  <th className="py-1 pr-3 text-right">P&L</th>
                  <th className="py-1 text-right">R</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {r.trades.map((t, i) => (
                  <tr key={i} className="border-t border-line/60">
                    <td className="py-1.5 pr-3 text-gray-400">{fmtDateTime(t.entryTime)}</td>
                    <td className="py-1.5 pr-3">{t.grade}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(t.entry)}</td>
                    <td className="py-1.5 pr-3 text-right">{fmtNum(t.exit)}</td>
                    <td className="py-1.5 pr-3 text-gray-400">{t.outcome}</td>
                    <td className={`py-1.5 pr-3 text-right ${t.pnl >= 0 ? "text-up" : "text-down"}`}>
                      {fmtUsd(t.pnl)}
                    </td>
                    <td className={`py-1.5 text-right ${t.r >= 0 ? "text-up" : "text-down"}`}>
                      {fmtNum(t.r)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}

function EquityCurve({ points, start }: { points: { time: number; equity: number }[]; start: number }) {
  if (points.length < 2) return <p className="text-sm text-gray-500">Not enough data.</p>;
  const W = 900;
  const H = 220;
  const pad = 4;
  const eq = points.map((p) => p.equity);
  const min = Math.min(...eq, start);
  const max = Math.max(...eq, start);
  const range = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / range) * (H - 2 * pad);
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(" ");
  const last = points[points.length - 1].equity;
  const tone = last >= start ? "#16c784" : "#ea3943";
  const baseY = y(start);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
      <line
        x1={pad}
        y1={baseY}
        x2={W - pad}
        y2={baseY}
        stroke="#556070"
        strokeDasharray="4 4"
        strokeOpacity="0.5"
      />
      <path d={path} fill="none" stroke={tone} strokeWidth={1.5} />
    </svg>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  );
}
