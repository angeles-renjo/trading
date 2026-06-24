import { NextRequest, NextResponse } from "next/server";
import { getWiring } from "@/lib/trading/factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Toggle the kill switch. Body: { halted: boolean }
export async function POST(req: NextRequest) {
  const { storage } = getWiring();
  const body = (await req.json().catch(() => ({}))) as { halted?: boolean };
  const state = await storage.load();
  state.halted = Boolean(body.halted);
  await storage.save(state);
  return NextResponse.json({ halted: state.halted });
}
