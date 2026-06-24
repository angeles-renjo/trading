"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { usePolling, postJson } from "@/lib/client/api";
import { Panel, Stat, Badge, Button, gradeTone } from "@/components/ui";
import { fmtUsd, fmtSignedUsd, fmtPct, fmtNum, fmtDateTime, toNzd } from "@/lib/format";
import type { StatusResponse } from "@/lib/api/types";

const PriceChart = dynamic(() => import("@/components/PriceChart"), {
  ssr: false,
  loading: () => <div className="h-[380px] animate-pulse rounded bg-panel-soft" />,
});

export default function Dashboard() {
  const { data, error, refresh } = usePolling<StatusResponse>("/api/status", 5000);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function action(name: string, fn: () => Promise<unknown>) {
    setBusy(name);
    setMsg(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (!data) {
    return (
      <div className="text-sm text-gray-500">
        {error ? `Error: ${error}` : "Loading…"}
      </div>
    );
  }

  const a = data.account;
  const nzd = (usd: number) => `≈ ${fmtNum(toNzd(usd, data.nzdPerUsd))} NZD`;
  const returnTone = a.totalReturnPct >= 0 ? "up" : "down";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-semibold text-gray-100">{data.symbol}</h1>
          <span className="tabular text-2xl font-bold text-gray-100">
            {data.price ? fmtUsd(data.price) : "—"}
          </span>
          {data.live ? (
            <Badge tone="live">● LIVE — real money</Badge>
          ) : (
            <Badge tone="up">paper</Badge>
          )}
          <Badge tone="neutral">data: {data.marketDataSource}</Badge>
          <Badge tone="neutral">strategy: {data.config.strategy}</Badge>
          {a.halted && <Badge tone="warn">⏸ halted</Badge>}
        </div>
        <div className="flex items-center gap-2">
          {!data.live && (
            <Button tone="primary" disabled={!!busy} onClick={() => action("tick", () => postJson("/api/bot/tick"))}>
              {busy === "tick" ? "Running…" : "▶ Run one cycle"}
            </Button>
          )}
          <Button
            disabled={!!busy}
            onClick={() => action("halt", () => postJson("/api/bot/halt", { halted: !a.halted }))}
          >
            {a.halted ? "Resume" : "Halt"}
          </Button>
          {!data.live && (
            <Button
              tone="danger"
              disabled={!!busy}
              onClick={() => {
                if (confirm("Reset the paper account to its starting balance?")) {
                  action("reset", () => postJson("/api/account/reset"));
                }
              }}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      {(error || data.error || msg) && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
          {msg || data.error || error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Equity" value={fmtUsd(a.equity)} sub={nzd(a.equity)} />
        <Stat
          label="Total return"
          value={fmtPct(a.totalReturnPct)}
          sub={fmtSignedUsd(a.equity - a.startingBalance)}
          tone={returnTone}
        />
        <Stat label="Cash" value={fmtUsd(a.cash)} sub={nzd(a.cash)} />
        <Stat
          label="Unrealized P&L"
          value={fmtSignedUsd(a.unrealizedPnl)}
          sub={fmtPct(a.unrealizedPct)}
          tone={a.unrealizedPnl > 0 ? "up" : a.unrealizedPnl < 0 ? "down" : "neutral"}
        />
        <Stat
          label="Realized today"
          value={fmtSignedUsd(a.realizedPnlToday)}
          tone={a.realizedPnlToday > 0 ? "up" : a.realizedPnlToday < 0 ? "down" : "neutral"}
        />
        <Stat
          label="Trades this week"
          value={`${data.tradesThisWeek}/${data.config.maxTradesPerWeek}`}
          sub={`risk ${fmtPct(data.config.riskPerTrade, 1)} · ${data.config.riskReward}:1`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Chart */}
        <Panel
          title={`${data.symbol} · ${labelInterval(data.config.primaryInterval)} with S/R zones`}
          className="lg:col-span-2"
        >
          <PriceChart interval={data.config.primaryInterval} />
        </Panel>

        {/* Position or setup */}
        <div className="space-y-5">
          <PositionOrSetup data={data} />
          <ZonesPanel data={data} />
        </div>
      </div>

      {/* Fills */}
      <Panel title="Recent fills">
        {data.fills.length === 0 ? (
          <p className="text-sm text-gray-500">No trades yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-gray-500">
                  <th className="py-1 pr-4">Time</th>
                  <th className="py-1 pr-4">Side</th>
                  <th className="py-1 pr-4">Reason</th>
                  <th className="py-1 pr-4 text-right">Qty</th>
                  <th className="py-1 pr-4 text-right">Price</th>
                  <th className="py-1 pr-4 text-right">Fee</th>
                  <th className="py-1 text-right">Realized P&L</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {data.fills.map((f) => (
                  <tr key={f.id} className="border-t border-line/60">
                    <td className="py-1.5 pr-4 text-gray-400">{fmtDateTime(f.timestamp)}</td>
                    <td className="py-1.5 pr-4">
                      <span className={f.side === "buy" ? "text-up" : "text-down"}>
                        {f.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-1.5 pr-4 text-gray-400">{f.reason}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(f.quantity, 6)}</td>
                    <td className="py-1.5 pr-4 text-right">{fmtNum(f.price)}</td>
                    <td className="py-1.5 pr-4 text-right text-gray-500">{fmtNum(f.fee, 4)}</td>
                    <td
                      className={`py-1.5 text-right ${
                        f.realizedPnl == null
                          ? "text-gray-600"
                          : f.realizedPnl >= 0
                            ? "text-up"
                            : "text-down"
                      }`}
                    >
                      {f.realizedPnl == null ? "—" : fmtSignedUsd(f.realizedPnl)}
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

function PositionOrSetup({ data }: { data: StatusResponse }) {
  const pos = data.position;
  if (pos) {
    const hasTarget = pos.target != null;
    const pct = hasTarget
      ? Math.max(0, Math.min(1, (data.price - pos.stop) / (pos.target! - pos.stop)))
      : 0;
    return (
      <Panel title="Open position">
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Quantity</span>
            <span className="tabular">{fmtNum(pos.quantity, 6)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Entry</span>
            <span className="tabular">{fmtUsd(pos.avgPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-down">Stop {hasTarget ? "" : "(trailing)"}</span>
            <span className="tabular text-down">{fmtUsd(pos.stop)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-up">Target</span>
            <span className="tabular text-up">{hasTarget ? fmtUsd(pos.target!) : "Trailing"}</span>
          </div>
          {hasTarget ? (
            <div className="pt-1">
              <div className="h-2 w-full overflow-hidden rounded bg-down/30">
                <div className="h-full bg-up" style={{ width: `${pct * 100}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>stop</span>
                <span>now {fmtUsd(data.price)}</span>
                <span>target</span>
              </div>
            </div>
          ) : (
            <div className="pt-1 text-xs text-gray-500">
              Riding the trend — exits when price closes back to the trailing stop.
              Now {fmtUsd(data.price)}.
            </div>
          )}
        </div>
      </Panel>
    );
  }

  const plan = data.plan;
  return (
    <Panel title="Current setup">
      {plan ? (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone={gradeTone(plan.grade)}>{plan.grade} setup</Badge>
            <span className="text-gray-400">
              {plan.target != null ? `${plan.riskReward}:1 reward:risk` : "trailing-stop exit"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Box label="Entry" value={fmtUsd(plan.entry)} tone="neutral" />
            <Box label="Stop" value={fmtUsd(plan.stop)} tone="down" />
            <Box
              label="Target"
              value={plan.target != null ? fmtUsd(plan.target) : "Trail"}
              tone="up"
            />
          </div>
          <p className="text-xs leading-relaxed text-gray-400">{plan.reason}</p>
          <p className="text-xs text-gray-600">
            Bot trades grade {data.config.minGrade}+ only. This is{" "}
            {gradeOk(plan.grade, data.config.minGrade) ? "tradeable." : "below the threshold — watching."}
          </p>
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          No qualifying setup right now. The bot waits for a confirmed bounce at a strong support zone.
        </p>
      )}
    </Panel>
  );
}

function ZonesPanel({ data }: { data: StatusResponse }) {
  const zones = [...data.zones].sort((a, b) => b.center - a.center);
  return (
    <Panel title="Support / resistance zones">
      {zones.length === 0 ? (
        <p className="text-sm text-gray-500">No zones detected yet.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {zones.map((z, i) => (
            <li key={i} className="flex items-center justify-between">
              <span className={z.kind === "support" ? "text-up" : "text-down"}>
                {z.kind === "support" ? "Support" : "Resistance"}
              </span>
              <span className="tabular text-gray-300">
                {fmtNum(z.lower)}–{fmtNum(z.upper)}
              </span>
              <span className="text-xs text-gray-500">
                {z.touches}× · str {z.strength}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function Box({ label, value, tone }: { label: string; value: string; tone: "neutral" | "up" | "down" }) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-gray-100";
  return (
    <div className="rounded-lg border border-line bg-panel-soft px-2 py-2">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className={`tabular text-sm font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function gradeOk(grade: string, min: string): boolean {
  const order: Record<string, number> = { "A+": 3, A: 2, B: 1 };
  return (order[grade] ?? 0) >= (order[min] ?? 0);
}

function labelInterval(i: string): string {
  const map: Record<string, string> = { "60": "1h", "240": "4h", D: "1D", "15": "15m", "30": "30m" };
  return map[i] ?? i;
}
