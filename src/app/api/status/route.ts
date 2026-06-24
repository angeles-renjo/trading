import { NextResponse } from "next/server";
import { buildStatus } from "@/lib/server/dashboard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const status = await buildStatus();
  return NextResponse.json(status);
}
