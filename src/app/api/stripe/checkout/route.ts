import { usableCustomerId } from "@/lib/stripeCustomer";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { getPriceMap } from "@/lib/stripePrices";
import { checkoutPrice, ENTITLED_STATUSES } from "@/lib/billing";

const Body = z.object({ product: z.enum(["plus", "pro", "credits_25"]) });

export async function POST(req: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const product = parsed.data.product;
  const isSub = product !== "credits_25";

  // Existing prices only (env or lookup key). Nothing is created in Stripe.
  let price: string | null;
  try {
    price = checkoutPrice(await getPriceMap(), product);
  } catch (err) {
    console.error("stripe price lookup failed", err);
    price = null;
  }
  if (!price) {
    return NextResponse.json({ error: "price_not_configured", message: "Payments are being set up. Try again in a little while." }, { status: 503 });
  }

  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("stripe_customer_id, plan, referred_by_code").eq("id", user.id).single();

  if (isSub && profile?.plan !== "free") {
    // Already subscribed: plan changes happen in the Customer Portal (prevents double subscriptions).
    return NextResponse.json({ error: "already_subscribed", message: "Manage or switch your plan from Billing." }, { status: 409 });
  }

  try {
    // A customer id saved in test mode doesn't exist in live mode: replace it instead of failing.
    let customerId = await usableCustomerId(profile?.stripe_customer_id as string | null, (id) => stripe().customers.retrieve(id));
    if (customerId && isSub) {
      // Ask Stripe too, in case our copy of the plan is stale (e.g. a webhook hasn't landed yet).
      const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 20 });
      if (subs.data.some((s) => (ENTITLED_STATUSES as readonly string[]).includes(s.status))) {
        return NextResponse.json({ error: "already_subscribed", message: "Manage or switch your plan from Billing." }, { status: 409 });
      }
    }
    if (!customerId) {
      const customer = await stripe().customers.create({ email: user.email, metadata: { user_id: user.id } });
      customerId = customer.id;
      await db.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    const session = await stripe().checkout.sessions.create({
      mode: isSub ? "subscription" : "payment",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: user.id,
      metadata: { user_id: user.id, product, ref: profile?.referred_by_code ?? "" },
      ...(isSub ? { subscription_data: { metadata: { user_id: user.id } } } : {}),
      allow_promotion_codes: true,
      success_url: `${brand.appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${brand.appUrl}/checkout/canceled`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("checkout failed", err);
    return NextResponse.json({ error: "checkout_failed", message: "Couldn't open checkout. Try again in a moment." }, { status: 502 });
  }
}
