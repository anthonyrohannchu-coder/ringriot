import { NextResponse } from "next/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { brand } from "@/config/brand";

// Uses the Stripe account's existing default Customer Portal configuration. Nothing is created here;
// if no portal is configured in the Stripe dashboard, this returns an error instead.
export async function POST() {
  if (!stripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin().from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!data?.stripe_customer_id) return NextResponse.json({ error: "no_billing_account" }, { status: 404 });

  try {
    const portal = await stripe().billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${brand.appUrl}/dashboard`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    console.error("billing portal failed", err);
    return NextResponse.json({ error: "portal_unavailable", message: "Billing is unavailable right now. Try again soon." }, { status: 502 });
  }
}
