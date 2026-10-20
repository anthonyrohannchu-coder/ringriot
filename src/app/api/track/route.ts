import { NextResponse, type NextRequest } from "next/server";
import { track } from "@/lib/events";
import { cleanPath, isBot, isClientEvent } from "@/lib/metrics";
import { brand } from "@/config/brand";

// First-party page-view beacon. A random anonymous id in a first-party cookie; no ad trackers, no personal data.
export async function POST(req: NextRequest) {
  if (isBot(req.headers.get("user-agent"))) return new NextResponse(null, { status: 204 });
  // Only count beacons sent by our own pages (blocks other sites from inflating the numbers).
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(brand.appUrl).origin && origin !== req.nextUrl.origin) return new NextResponse(null, { status: 204 });
  const body = (await req.json().catch(() => null)) as { name?: unknown; path?: unknown } | null;
  if (!body || !isClientEvent(body.name)) return new NextResponse(null, { status: 204 });
  let vid = req.cookies.get("rr_vid")?.value;
  const fresh = !vid || !/^[a-z0-9-]{8,40}$/.test(vid);
  if (fresh) vid = crypto.randomUUID();
  await track(body.name, { visitorId: vid, path: cleanPath(body.path), ref: req.cookies.get("rr_ref")?.value ?? null });
  const res = new NextResponse(null, { status: 204 });
  if (fresh) res.cookies.set("rr_vid", vid!, { maxAge: 60 * 60 * 24 * 365, sameSite: "lax", path: "/", httpOnly: true });
  return res;
}
