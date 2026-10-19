import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeConfigured() {
  return !!process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.endsWith("...");
}

export function stripe() {
  if (!stripeConfigured()) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY missing).");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY!);
  return client;
}

export function isLiveMode() {
  return process.env.STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false;
}
