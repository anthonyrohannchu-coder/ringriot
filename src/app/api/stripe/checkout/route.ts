import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { brand } from "@/config/brand";
import { ensureStripeSetup } from "@/lib/stripeSetup";

const Body = z.object({ product: z.enum(["plus", "pro", "credits_25"]) });


export async function POST(req: NextRequest) {
  if (!stripeConfigured()) return NextResponse.json({ error: "stripe_not_configured" }, { status: 501 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  let price: string;
  try {
    price = (await ensureStripeSetup())[parsed.data.product];
  } catch (err) {
    console.error("stripe setup failed", err);
    return NextResponse.json({ error: "stripe_setup_failed", message: "Payments are being set up. Try again in a minute." }, { status: 503 });
  }

  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("stripe_customer_id, plan, referred_by_code").eq("id", user.id).single();

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: user.email, metadata: { user_id: user.id } });
    customerId = customer.id;
    await db.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const isSub = parsed.data.product !== "credits_25";
  if (isSub && profile?.plan !== "free") {
    // Already subscribed: plan changes happen in the Customer Portal (prevents double subscriptions).
    return NextResponse.json({ error: "already_subscribed", message: "Manage or switch your plan from Billing." }, { status: 409 });
  }

  const session = await stripe().checkout.sessions.create({
    mode: isSub ? "subscription" : "payment",
    customer: customerId,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    metadata: { user_id: user.id, product: parsed.data.product, ref: profile?.referred_by_code ?? "" },
    ...(isSub ? { subscription_data: { metadata: { user_id: user.id } } } : {}),
    allow_promotion_codes: true,
    success_url: `${brand.appUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${brand.appUrl}/checkout/canceled`,
  });

  return NextResponse.json({ url: session.url });
}
