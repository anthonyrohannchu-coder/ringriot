import { NextResponse, type NextRequest } from "next/server";

// Creator referral links: /r/<code> → sets a 30-day attribution cookie, lands on the demo.
export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
  const res = NextResponse.redirect(new URL("/#demo", req.url));
  if (clean) {
    // First touch wins: don't overwrite an existing referral.
    if (!req.cookies.get("rr_ref")) {
      res.cookies.set("rr_ref", clean, { maxAge: 60 * 60 * 24 * 30, sameSite: "lax", path: "/" });
    }
  }
  return res;
}
