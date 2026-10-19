import { NextResponse } from "next/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { ensureStripeSetup } from "@/lib/stripeSetup";

export async function POST() {
  if (!stripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabaseAdmin().from("profiles").select("stripe_customer_id").eq("id", user.id).single();
  if (!data?.stripe_customer_id) return NextResponse.json({ error: "no_billing_account" }, { status: 404 });

  await ensureStripeSetup(); // makes sure a portal configuration exists
  const portal = await stripe().billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: `${brand.appUrl}/dashboard`,
  });
  return NextResponse.json({ url: portal.url });
}
