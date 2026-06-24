import { NextResponse } from "next/server";
import { getWiring } from "@/lib/trading/factory";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Manually run one decision cycle (useful for paper testing from the UI).
export async function POST() {
  try {
    const { engine } = getWiring();
    const result = await engine.tick();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
