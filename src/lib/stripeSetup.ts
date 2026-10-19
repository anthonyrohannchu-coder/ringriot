import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { brand } from "@/config/brand";
import type { PlanId } from "@/config/plans";

// Self-configuring Stripe: whatever secret key is set (test or live, any account),
// the app finds-or-creates its products, the billing portal and its webhook.
// Nothing needs to be copied from the Stripe dashboard except the secret key.

type Resolved = { plus: string; pro: string; credits_25: string };

const CATALOG = [
  { key: "plus", lookup: "ringriot_plus", name: "RingRiot Plus", amount: 999, recurring: true, desc: "40 credits every month" },
  { key: "pro", lookup: "ringriot_pro", name: "RingRiot Pro", amount: 1999, recurring: true, desc: "60 credits every month" },
  { key: "credits_25", lookup: "ringriot_credits_25", name: "RingRiot 25 Credits", amount: 499, recurring: false, desc: "One-time pack of 25 credits" },
] as const;

export const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
  "charge.refunded",
];

let cached: Promise<Resolved> | null = null;

export function ensureStripeSetup(): Promise<Resolved> {
  cached ??= setup().catch((e) => {
    cached = null; // retry next time
    throw e;
  });
  return cached;
}

async function setup(): Promise<Resolved> {
  const s = stripe();

  // 1) Prices, found by lookup key or created.
  const existing = await s.prices.list({ lookup_keys: CATALOG.map((c) => c.lookup), active: true, limit: 10 });
  const out: Partial<Resolved> = {};
  for (const item of CATALOG) {
    let price = existing.data.find((p) => p.lookup_key === item.lookup);
    if (!price) {
      price = await s.prices.create({
        currency: "usd",
        unit_amount: item.amount,
        lookup_key: item.lookup,
        transfer_lookup_key: true,
        ...(item.recurring ? { recurring: { interval: "month" } } : {}),
        product_data: { name: item.name, metadata: { app: "ringriot" } },
        metadata: { app: "ringriot", product: item.key },
      });
    }
    out[item.key] = price.id;
  }
  const resolved = out as Resolved;

  // 2) Webhook endpoint pointing at this site.
  const url = `${brand.appUrl}/api/stripe/webhook`;
  if (url.startsWith("https://")) {
    const hooks = await s.webhookEndpoints.list({ limit: 100 });
    const mine = hooks.data.find((h) => h.url === url);
    if (!mine) {
      await s.webhookEndpoints.create({ url, enabled_events: WEBHOOK_EVENTS, description: "RingRiot (auto-created)" });
    } else if (mine.status !== "enabled") {
      await s.webhookEndpoints.update(mine.id, { disabled: false, enabled_events: WEBHOOK_EVENTS });
    }
  }

  // 3) Billing portal: cancel, switch Plus <-> Pro, update card.
  const portals = await s.billingPortal.configurations.list({ is_default: true, limit: 1 });
  if (!portals.data.length) {
    const products = await Promise.all(
      [resolved.plus, resolved.pro].map(async (id) => {
        const p = await s.prices.retrieve(id);
        return { product: String(p.product), prices: [id] };
      }),
    );
    await s.billingPortal.configurations.create({
      business_profile: { headline: `Manage your ${brand.name} plan` },
      features: {
        invoice_history: { enabled: true },
        payment_method_update: { enabled: true },
        customer_update: { enabled: true, allowed_updates: ["email"] },
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: { enabled: true, default_allowed_updates: ["price"], proration_behavior: "create_prorations", products },
      },
    });
  }

  return resolved;
}

export async function planForPrice(priceId: string | null | undefined): Promise<PlanId | null> {
  if (!priceId) return null;
  const r = await ensureStripeSetup();
  if (priceId === r.plus) return "plus";
  if (priceId === r.pro) return "pro";
  return null;
}
