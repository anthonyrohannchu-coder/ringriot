import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/server";
import { computeMetrics, type EventRow, type SubRow } from "@/lib/metrics";

// Admin-only, read-only funnel + revenue metrics.  /api/admin/metrics?days=7
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("Not found", { status: 404 });
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get("days") ?? 7) || 7));
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const db = supabaseAdmin();
  const events: EventRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("events").select("name, visitor_id, user_id, ref, props").gte("at", since).range(from, from + 999);
    if (error) return NextResponse.json({ error: `events: ${error.message}` }, { status: 500 });
    events.push(...((data ?? []) as EventRow[]));
    if (!data || data.length < 1000) break;
  }
  const { data: subs } = await db.from("subscriptions").select("plan, status, cancel_at_period_end");
  const { count: totalUsers } = await db.from("profiles").select("id", { count: "exact", head: true });
  return NextResponse.json(
    { days, since, totalUsers, ...computeMetrics(events, (subs ?? []) as SubRow[]) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
