import { NextRequest, NextResponse } from "next/server";
import { buildCandles } from "@/lib/server/dashboard";
import { isValidInterval } from "@/lib/exchange";
import { getConfig } from "@/lib/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const cfg = getConfig();
  const interval = req.nextUrl.searchParams.get("interval") || cfg.primaryInterval;
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 300, 1000);
  if (!isValidInterval(interval)) {
    return NextResponse.json({ error: `invalid interval: ${interval}` }, { status: 400 });
  }
  const data = await buildCandles(interval, limit);
  return NextResponse.json(data);
}
