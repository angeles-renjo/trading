import { NextRequest, NextResponse } from "next/server";
import { getWiring } from "@/lib/trading/factory";
import { runBacktest } from "@/lib/backtest/backtester";
import { isValidInterval } from "@/lib/exchange";
import type { SetupGrade } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Body: { bars?: number, interval?: string, grade?: "A+"|"A"|"B" }
export async function POST(req: NextRequest) {
  try {
    const { cfg, md } = getWiring();
    const body = (await req.json().catch(() => ({}))) as {
      bars?: number;
      interval?: string;
      grade?: SetupGrade;
    };
    const interval = body.interval || cfg.primaryInterval;
    const bars = Math.min(Math.max(Number(body.bars) || 1500, 100), 10_000);
    const grade = (body.grade || cfg.minGrade) as SetupGrade;

    if (!isValidInterval(interval)) {
      return NextResponse.json({ error: `invalid interval: ${interval}` }, { status: 400 });
    }

    const candles = await md.getHistory(cfg.symbol, interval, bars);
    if (candles.length < 60) {
      return NextResponse.json(
        { error: `not enough candles (${candles.length}) — is the data source reachable?` },
        { status: 502 },
      );
    }
    const result = runBacktest(candles, { ...cfg, primaryInterval: interval }, { minGrade: grade });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
