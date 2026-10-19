import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits } from "@/lib/credits";
import { creditPack, plans } from "@/config/plans";
import { planForPrice } from "@/lib/stripeSetup";

// The ONLY place paid entitlements are granted. Never trust the success page.
// Authenticity: if STRIPE_WEBHOOK_SECRET matches, the signature is verified. Otherwise the
// event is re-fetched from Stripe with our secret key, so a forged payload can't grant anything.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event | null = null;
  if (sig && secret) {
    try {
      event = stripe().webhooks.constructEvent(raw, sig, secret);
    } catch {
      event = null; // secret may belong to another account; fall through to re-fetch
    }
  }
  if (!event) {
    try {
      const id = (JSON.parse(raw) as { id?: string }).id;
      if (!id || !id.startsWith("evt_")) throw new Error("no event id");
      event = await stripe().events.retrieve(id);
    } catch (err) {
      console.error("webhook verification failed", err);
      return NextResponse.json({ error: "unverified event" }, { status: 400 });
    }
  }

  const db = supabaseAdmin();

  // Duplicate-event protection: insert fails if we've processed this event id.
  const { error: dupErr } = await db.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupErr) {
    if (dupErr.code === "23505") return NextResponse.json({ received: true, duplicate: true });
    return NextResponse.json({ error: "db" }, { status: 500 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const userId = s.metadata?.user_id || s.client_reference_id;
        if (!userId) break;
        if (s.mode === "payment" && s.payment_status === "paid" && s.metadata?.product === "credits_25") {
          await grantCredits(userId, creditPack.credits, `pack:${s.id}`, "credit pack purchase");
        }
        // Subscription credits are granted on invoice.paid, not here, to avoid double grants.
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = sub.metadata?.user_id ?? (await userForCustomer(String(sub.customer)));
        if (!userId) break;
        const item = sub.items.data[0];
        const priceId = item?.price?.id ?? null;
        const plan = (await planForPrice(priceId)) ?? "free";
        // current_period_end lives on the item in newer API versions, on the sub in older ones.
        const periodEnd =
          (item as unknown as { current_period_end?: number })?.current_period_end ??
          (sub as unknown as { current_period_end?: number }).current_period_end;
        await db.from("subscriptions").upsert({
          id: sub.id,
          user_id: userId,
          plan,
          status: sub.status,
          price_id: priceId,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        });
        const entitled = ["active", "trialing", "past_due"].includes(sub.status) && event.type !== "customer.subscription.deleted";
        await db.from("profiles").update({ plan: entitled ? plan : "free" }).eq("id", userId);
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as Stripe.Invoice;
        const userId = await userForCustomer(String(inv.customer));
        if (!userId) break;
        const priceId = invoicePriceId(inv);
        const plan = await planForPrice(priceId);
        if (plan && plan !== "free") {
          // Monthly allowance on first payment and every renewal; keyed by invoice so retries can't double-grant.
          await grantCredits(userId, plans[plan].monthlyCredits, `invoice:${inv.id}`, `${plan} monthly credits`);
          await recordReferral(userId, inv);
        }
        break;
      }

      case "invoice.payment_failed": {
        // Stripe retries automatically (Smart Retries). Status flips to past_due via subscription.updated.
        // If it ends up canceled, customer.subscription.deleted downgrades the plan.
        console.warn("payment failed", (event.data.object as Stripe.Invoice).id);
        break;
      }

      case "charge.refunded": {
        const ch = event.data.object as Stripe.Charge;
        const invId = (ch as unknown as { invoice?: string }).invoice;
        if (invId) {
          await db.from("referral_conversions").update({ status: "refunded", commission_cents: 0 }).eq("stripe_invoice_id", invId);
        }
        break;
      }
    }
  } catch (err) {
    console.error("webhook handler error", event.type, err);
    // Let Stripe retry: remove the idempotency marker so the retry is processed.
    await db.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "handler" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function userForCustomer(customerId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
  return data?.id as string | undefined;
}

function invoicePriceId(inv: Stripe.Invoice): string | null {
  const line = inv.lines?.data?.[0] as unknown as {
    price?: { id: string };
    pricing?: { price_details?: { price?: string } };
  };
  return line?.pricing?.price_details?.price ?? line?.price?.id ?? null;
}

async function recordReferral(userId: string, inv: Stripe.Invoice) {
  const db = supabaseAdmin();
  const { data: conv } = await db
    .from("referral_conversions")
    .select("code")
    .eq("referred_user_id", userId)
    .limit(1)
    .maybeSingle();
  if (!conv) return;
  const { data: code } = await db.from("referral_codes").select("commission_rate, user_id").eq("code", conv.code).single();
  if (!code || code.user_id === userId) return; // no self-referrals
  const amount = inv.amount_paid ?? 0;
  await db.from("referral_conversions").upsert(
    {
      code: conv.code,
      referred_user_id: userId,
      stripe_invoice_id: inv.id,
      amount_cents: amount,
      commission_cents: Math.round(amount * Number(code.commission_rate)),
      status: "paid",
    },
    { onConflict: "stripe_invoice_id" },
  );
}
