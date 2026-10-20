import { NextResponse, type NextRequest } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { grantCredits, reserveCredits, settleCredits } from "@/lib/credits";
import { handlePackRefund } from "@/lib/refunds";
import { creditPack, plans } from "@/config/plans";
import { getPriceMap } from "@/lib/stripePrices";
import {
  invoiceCustomerId, invoiceGrantKey, invoiceGrantsMonthlyCredits, invoicePlan, invoiceSubscriptionId,
  invoiceUserId, isEntitled, isStaleSubscriptionEvent, packGrantKey, planForPrice, unmappedInvoicePrices,
  type InvoiceLike,
} from "@/lib/billing";

// The ONLY place paid entitlements are granted. Never trust the success page.
// Authenticity: if STRIPE_WEBHOOK_SECRET matches, the signature is verified. Otherwise the
// event is re-fetched from Stripe with our secret key, so a forged payload can't grant anything.
//
// Idempotency, in layers:
//  1. stripe_events: an event id is processed once; the marker is removed on failure so Stripe's retry runs.
//  2. grant_credits(): keyed by invoice id / checkout session id with ON CONFLICT DO NOTHING, so even a
//     re-processed event (or a manual backfill using the same key) can never add credits twice.
//  3. Subscription rows are upserts of Stripe's state, so replays converge to the same result.

/** Thrown when a paid price isn't mapped to a plan. Returns 500 so Stripe retries after config is fixed. */
class UnmappedPriceError extends Error {}

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
          if (!(await profileExists(userId))) break;
          await grantCredits(userId, creditPack.credits, packGrantKey(s.id), "credit pack purchase");
        }
        // Subscription credits are granted on invoice.paid, not here, to avoid double grants.
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const userId = await resolveUser(sub.metadata?.user_id, String(sub.customer));
        if (!userId) break; // unknown or deleted account: nothing to update

        const item = sub.items.data[0];
        const priceId = item?.price?.id ?? null;
        const deleted = event.type === "customer.subscription.deleted";
        const entitled = !deleted && isEntitled(sub.status);
        const plan = planForPrice(await getPriceMap(), priceId);
        if (entitled && !plan) {
          // Never downgrade a paying customer because a price isn't configured.
          throw new UnmappedPriceError(`subscription ${sub.id} uses unmapped price ${priceId}`);
        }

        const { data: stored } = await db.from("subscriptions").select("status").eq("id", sub.id).maybeSingle();
        if (!deleted && isStaleSubscriptionEvent(stored?.status, sub.status)) {
          console.warn("ignoring stale subscription event", event.id, sub.id, sub.status);
          break;
        }

        // current_period_end lives on the item in newer API versions, on the sub in older ones.
        const periodEnd =
          (item as unknown as { current_period_end?: number })?.current_period_end ??
          (sub as unknown as { current_period_end?: number }).current_period_end;
        const { error: upsertErr } = await db.from("subscriptions").upsert({
          id: sub.id,
          user_id: userId,
          plan: plan ?? "free",
          status: deleted ? "canceled" : sub.status,
          price_id: priceId,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancel_at_period_end: sub.cancel_at_period_end,
          updated_at: new Date().toISOString(),
        });
        if (upsertErr) throw upsertErr;

        if (entitled && plan) {
          const { error } = await db.from("profiles").update({ plan }).eq("id", userId);
          if (error) throw error;
        } else {
          // Only drop to Free if no OTHER subscription still entitles this user.
          const { data: others, error: othersErr } = await db
            .from("subscriptions")
            .select("plan, status")
            .eq("user_id", userId)
            .neq("id", sub.id);
          if (othersErr) throw othersErr;
          const keep = (others ?? []).find((o) => isEntitled(o.status) && (o.plan === "plus" || o.plan === "pro"));
          const { error } = await db.from("profiles").update({ plan: keep ? keep.plan : "free" }).eq("id", userId);
          if (error) throw error;
        }
        break;
      }

      case "invoice.paid": {
        const inv = event.data.object as unknown as InvoiceLike & { amount_paid?: number };
        if (!invoiceSubscriptionId(inv)) break; // not a subscription invoice
        if (!invoiceGrantsMonthlyCredits(inv)) {
          console.info("invoice paid without monthly grant", inv.id, inv.billing_reason);
          break;
        }
        const customerId = invoiceCustomerId(inv);
        const userId = await resolveUser(invoiceUserId(inv), customerId);
        if (!userId) break;
        const map = await getPriceMap();
        const found = invoicePlan(inv, map);
        if (!found) {
          throw new UnmappedPriceError(`invoice ${inv.id} has unmapped prices ${unmappedInvoicePrices(inv, map).join(",") || "(none)"}`);
        }
        // Monthly allowance on first payment and every renewal; keyed by invoice so retries can't double-grant.
        await grantCredits(userId, plans[found.plan].monthlyCredits, invoiceGrantKey(inv.id), `${found.plan} monthly credits`);
        await recordReferral(userId, inv.id, inv.amount_paid ?? 0);
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
        // Credit-pack refund: take back that pack's unspent credits (subscriptions are cancelled in the portal).
        await handlePackRefund(
          { id: ch.id, amount: ch.amount, amount_refunded: ch.amount_refunded, invoice: invId ?? null,
            payment_intent: typeof ch.payment_intent === "string" ? ch.payment_intent : ch.payment_intent?.id ?? null },
          {
            packCredits: creditPack.credits,
            findSession: async (pi) => {
              const cs = (await stripe().checkout.sessions.list({ payment_intent: pi, limit: 1 })).data[0];
              return cs ? { id: cs.id, userId: cs.metadata?.user_id || cs.client_reference_id || null, product: cs.metadata?.product ?? null } : null;
            },
            balance: async (userId) => (await db.from("credit_balances").select("balance").eq("user_id", userId).maybeSingle()).data?.balance ?? 0,
            clawedSoFar: async (userId, prefix) => {
              const { data } = await db.from("credit_transactions").select("amount").eq("user_id", userId).like("idempotency_key", `${prefix}%`);
              return (data ?? []).reduce((sum, t) => sum - Number(t.amount), 0);
            },
            reserve: (userId, n, key) => reserveCredits(userId, n, key, "credit pack refunded"),
            settle: settleCredits,
          },
        );
        break;
      }
    }
  } catch (err) {
    console.error("webhook handler error", event.type, event.id, err);
    // Let Stripe retry: remove the idempotency marker so the retry is processed.
    await db.from("stripe_events").delete().eq("id", event.id);
    return NextResponse.json({ error: err instanceof UnmappedPriceError ? "unmapped_price" : "handler" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function profileExists(userId: string) {
  const { data } = await supabaseAdmin().from("profiles").select("id").eq("id", userId).maybeSingle();
  return !!data;
}

/** Our user for a Stripe object: by saved customer id first, then the user_id metadata set at checkout. */
async function resolveUser(metadataUserId: string | null | undefined, customerId: string | null) {
  if (customerId) {
    const { data } = await supabaseAdmin().from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  if (metadataUserId && (await profileExists(metadataUserId))) return metadataUserId;
  return null;
}

async function recordReferral(userId: string, invoiceId: string, amountPaid: number) {
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
  if (!code.user_id) return; // referrer deleted their account (migration 0003): keep history, accrue no new commission
  await db.from("referral_conversions").upsert(
    {
      code: conv.code,
      referred_user_id: userId,
      stripe_invoice_id: invoiceId,
      amount_cents: amountPaid,
      commission_cents: Math.round(amountPaid * Number(code.commission_rate)),
      status: "paid",
    },
    { onConflict: "stripe_invoice_id" },
  );
}
