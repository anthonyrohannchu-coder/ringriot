import { stripe } from "@/lib/stripe";
import {
  emptyPriceMap, findPriceConflicts, mergePriceMaps, parsePriceList,
  type BillingProduct, type PriceMap,
} from "@/lib/billing";

// Which Stripe Prices belong to which plan. READ-ONLY: nothing here creates, updates or deletes
// anything in Stripe (this replaces the old self-configuring stripeSetup.ts).
//
// Sources, in priority order:
//  1. Env vars STRIPE_PRICE_PLUS / STRIPE_PRICE_PRO / STRIPE_PRICE_CREDITS_25. Each may be a
//     comma-separated list; the FIRST id is used for new checkouts, all ids are recognised in webhooks,
//     so older prices that existing subscribers are still on keep mapping to the right plan.
//  2. Existing active prices carrying the lookup keys ringriot_plus / ringriot_pro / ringriot_credits_25
//     (only listed, never created), so subscribers on any such prices are recognised too.

const ENV_VARS: Record<BillingProduct, string> = {
  plus: "STRIPE_PRICE_PLUS",
  pro: "STRIPE_PRICE_PRO",
  credits_25: "STRIPE_PRICE_CREDITS_25",
};

const LOOKUP_KEYS: Record<BillingProduct, string> = {
  plus: "ringriot_plus",
  pro: "ringriot_pro",
  credits_25: "ringriot_credits_25",
};

export function envPriceMap(env: Record<string, string | undefined> = process.env): PriceMap {
  const map = emptyPriceMap();
  for (const key of Object.keys(ENV_VARS) as BillingProduct[]) map[key] = parsePriceList(env[ENV_VARS[key]]);
  return map;
}

async function lookupPriceMap(): Promise<PriceMap> {
  const map = emptyPriceMap();
  const res = await stripe().prices.list({ lookup_keys: Object.values(LOOKUP_KEYS), active: true, limit: 10 });
  for (const price of res.data) {
    const key = (Object.keys(LOOKUP_KEYS) as BillingProduct[]).find((k) => LOOKUP_KEYS[k] === price.lookup_key);
    if (key) map[key].push(price.id);
  }
  return map;
}

let cached: { map: PriceMap; at: number } | null = null;
const CACHE_MS = 10 * 60_000;

export async function getPriceMap(): Promise<PriceMap> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.map;

  const fromEnv = envPriceMap();
  const envComplete = (Object.keys(ENV_VARS) as BillingProduct[]).every((k) => fromEnv[k].length > 0);

  let fromLookup = emptyPriceMap();
  try {
    fromLookup = await lookupPriceMap();
  } catch (err) {
    // With every env var set we can run without the lookup; otherwise mapping could be incomplete.
    if (!envComplete) throw err;
    console.error("stripe price lookup failed; using env price ids only", err);
  }

  const map = mergePriceMaps(fromEnv, fromLookup);
  const conflicts = findPriceConflicts(map);
  if (conflicts.length) throw new Error(`Stripe price configuration conflict: ${conflicts.join("; ")}`);

  const missing = (Object.keys(map) as BillingProduct[]).filter((k) => map[k].length === 0);
  if (missing.length) console.warn(`No Stripe price configured for: ${missing.map((k) => ENV_VARS[k]).join(", ")}`);

  cached = { map, at: Date.now() };
  return map;
}
