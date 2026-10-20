import { isMissingCustomerError } from "@/lib/stripeCustomer";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { isMissingColumnError, runAccountDeletion, type DeletionSub } from "@/lib/accountDeletion";

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

// Delete account. The ordering and rollback rules live in src/lib/accountDeletion.ts.
export async function DELETE(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { confirmForfeit?: boolean } | null;
  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("stripe_customer_id").eq("id", user.id).single();

  const result = await runAccountDeletion(
    {
      billingAvailable: stripeConfigured(),
      listSubscriptions: () => listSubscriptions(user.id, profile?.stripe_customer_id ?? null),
      findBlockers: () => referralBlockers(user.id),
      setCancelAtPeriodEnd: async (id, value) => {
        await stripe().subscriptions.update(id, { cancel_at_period_end: value });
      },
      cancelNow: async (id) => {
        await stripe().subscriptions.cancel(id);
      },
      deleteUser: async () => {
        const { error } = await db.auth.admin.deleteUser(user.id);
        if (error) throw error;
      },
      audit: async (action, detail) => {
        const { error } = await db.from("admin_audit_log").insert({ actor: user.id, action, detail });
        if (error) throw error;
      },
      log: (message, err) => console.error(message, err ?? ""),
    },
    { confirmForfeit: body?.confirmForfeit === true },
  );

  if (result.ok) return NextResponse.json({ ok: true });
  const { status, ...rest } = result;
  return NextResponse.json(rest, { status });
}

/** Stripe is the source of truth when we know the customer; our mirror table is the fallback. */
async function listSubscriptions(userId: string, customerId: string | null): Promise<DeletionSub[]> {
  if (customerId && stripeConfigured()) {
    let res;
    try {
      res = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 100 });
    } catch (err) {
      // A customer from the other Stripe mode has no subscriptions here.
      if (isMissingCustomerError(err)) return [];
      throw err;
    }
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
  return (data ?? []) as DeletionSub[];
}

/**
 * Referral rows that deletion would break or erase. Once migration 0003 is applied, both sides of a
 * referral survive deletion (links set to NULL, history kept), so there are no blockers. Until then:
 *  - a referrer whose code has conversions can't be deleted (the FK would fail), and
 *  - deleting a referred user would erase their conversion from the referrer's history,
 * so both are blocked here BEFORE any subscription is touched.
 */
async function referralBlockers(userId: string): Promise<string[]> {
  const db = supabaseAdmin();
  const probe = await db.from("referral_codes").select("owner_deleted_at").limit(1);
  if (!probe.error) return [];
  if (!isMissingColumnError(probe.error, "owner_deleted_at")) throw probe.error;

  const blockers: string[] = [];
  const { data: codes, error } = await db.from("referral_codes").select("code").eq("user_id", userId);
  if (error) throw error;
  if (codes?.length) {
    const { count, error: convErr } = await db
      .from("referral_conversions")
      .select("id", { count: "exact", head: true })
      .in("code", codes.map((c) => c.code))
      .neq("referred_user_id", userId);
    if (convErr) throw convErr;
    if (count) blockers.push("referrer_has_conversions");
  }
  const { count: own, error: ownErr } = await db
    .from("referral_conversions")
    .select("id", { count: "exact", head: true })
    .eq("referred_user_id", userId);
  if (ownErr) throw ownErr;
  if (own) blockers.push("referred_user_has_conversion");
  return blockers;
}
