import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/events";
import { isBot, isClientEvent } from "@/lib/metrics";

// First-party page-view beacon. A random anonymous id in a first-party cookie; no ad trackers, no personal data.
export async function POST(req: NextRequest) {
  if (isBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { name?: unknown; path?: unknown } | null;
  if (!body || !isClientEvent(body.name)) return new NextResponse(null, { status: 204 });
  let vid = req.cookies.get("rr_vid")?.value;
  const fresh = !vid || !/^[a-z0-9-]{8,40}$/.test(vid);
  if (fresh) vid = crypto.randomUUID();
  await track(body.name, { visitorId: vid, path: typeof body.path === "string" ? body.path : null, ref: req.cookies.get("rr_ref")?.value ?? null });
  const res = new NextResponse(null, { status: 204 });
  if (fresh) res.cookies.set("rr_vid", vid!, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", httpOnly: true });
  return res;
}
