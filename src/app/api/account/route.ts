import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { deletionActionFor, isTerminal } from "@/lib/billing";

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

type Sub = { id: string; status: string; cancel_at_period_end: boolean; current_period_end: string | null };

/**
 * Delete account.
 * 1. If a paid period is still running and the user hasn't confirmed, stop and tell them (409), so they can
 *    keep what they paid for by canceling in the Customer Portal instead and deleting later.
 * 2. Otherwise stop all billing first: good-standing subscriptions stop renewing at period end (no further
 *    charges); subscriptions with failed payments are canceled now so Stripe stops retrying the card.
 * 3. Only if every Stripe call succeeded, delete the user (profile, credits and history cascade).
 *    If Stripe can't be updated, the account is NOT deleted, so nobody keeps being billed without an account.
 */
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { confirmForfeit?: boolean } | null;
  const db = supabaseAdmin();

  const { data: profile } = await db.from("profiles").select("plan, stripe_customer_id").eq("id", user.id).single();
  let subs: Sub[];
  try {
    subs = await listSubscriptions(user.id, profile?.stripe_customer_id ?? null);
  } catch (err) {
    console.error("delete account: couldn't read subscriptions", err);
    return NextResponse.json({ error: "billing_unavailable", message: "We couldn't check your subscription, so nothing was deleted. Try again in a moment." }, { status: 502 });
  }

  const live = subs.filter((s) => !isTerminal(s.status));
  if (live.length && !stripeConfigured()) {
    return NextResponse.json({ error: "billing_unavailable", message: "Billing is offline, so nothing was deleted. Email support to close your account." }, { status: 503 });
  }

  const paidThrough = live
    .filter((s) => s.status === "active" || s.status === "trialing")
    .map((s) => s.current_period_end)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  if (paidThrough && body?.confirmForfeit !== true) {
    return NextResponse.json({ error: "active_subscription", paidThrough, plan: profile?.plan ?? null }, { status: 409 });
  }

  for (const s of live) {
    const action = deletionActionFor(s.status, s.cancel_at_period_end);
    try {
      if (action === "cancel_at_period_end") await stripe().subscriptions.update(s.id, { cancel_at_period_end: true });
      if (action === "cancel_now") await stripe().subscriptions.cancel(s.id);
    } catch (err) {
      console.error("delete account: couldn't stop subscription", s.id, err);
      return NextResponse.json({ error: "billing_update_failed", message: "We couldn't stop your subscription, so your account was not deleted. Try again or email support." }, { status: 502 });
    }
  }

  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) return NextResponse.json({ error: "delete_failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Stripe is the source of truth when we know the customer; our mirror table is the fallback. */
async function listSubscriptions(userId: string, customerId: string | null): Promise<Sub[]> {
  if (customerId && stripeConfigured()) {
    const res = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    return res.data.map((s) => {
      const end =
        (s.items.data[0] as unknown as { current_period_end?: number } | undefined)?.current_period_end ??
        (s as unknown as { current_period_end?: number }).current_period_end;
      return { id: s.id, status: s.status, cancel_at_period_end: s.cancel_at_period_end, current_period_end: end ? new Date(end * 1000).toISOString() : null };
    });
  }
  const { data, error } = await supabaseAdmin()
    .from("subscriptions")
    .select("id, status, cancel_at_period_end, current_period_end")
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as Sub[];
}
