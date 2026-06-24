import { NextResponse } from "next/server";
import { getWiring } from "@/lib/trading/factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Reset the paper account to its starting balance. Refused for live accounts.
export async function POST() {
  const { storage, live } = getWiring();
  if (live) {
    return NextResponse.json(
      { error: "refusing to reset a LIVE account from the dashboard" },
      { status: 400 },
    );
  }
  const state = await storage.reset();
  return NextResponse.json({ ok: true, cash: state.cash });
}
