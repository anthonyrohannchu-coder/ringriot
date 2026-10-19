import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";

const Patch = z.object({
  save_transcripts: z.boolean().optional(),
  transcript_retention_days: z.number().int().min(1).max(365).optional(),
});

// Update privacy settings.
export async function PATCH(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  await supabaseAdmin().from("profiles").update(parsed.data).eq("id", user.id);
  return NextResponse.json({ ok: true });
}

// Delete account: cancels Stripe subscriptions, then removes all user data (cascades).
export async function DELETE() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const db = supabaseAdmin();
  const { data: subs } = await db.from("subscriptions").select("id, status").eq("user_id", user.id);
  if (stripeConfigured()) {
    for (const s of subs ?? []) {
      if (s.status !== "canceled") await stripe().subscriptions.cancel(s.id).catch(() => null);
    }
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
