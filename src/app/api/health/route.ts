import { NextResponse } from "next/server";

// Liveness for Render's health check or an uptime pinger. No database, no secrets.
export const dynamic = "force-dynamic";
export function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
