// Pure billing rules: no network, no database, no framework imports, so they can be unit-tested.
// Server code (stripePrices.ts, the webhook) supplies the inputs.

export type PaidPlan = "plus" | "pro";
export type BillingProduct = PaidPlan | "credits_25";

/** Every Stripe Price ID the app accepts for each product. The first ID is the one new checkouts use. */
export type PriceMap = Record<BillingProduct, string[]>;

const PRICE_ID = /^price_[A-Za-z0-9]+$/;

/** "price_a, price_b" -> ["price_a", "price_b"]. Ignores blanks, placeholders and anything that isn't a Price ID. */
export function parsePriceList(value: string | undefined | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((s) => s.trim()).filter((s) => PRICE_ID.test(s)))];
}

export function emptyPriceMap(): PriceMap {
  return { plus: [], pro: [], credits_25: [] };
}

/** Merge several sources (env first, then read-only lookup results), keeping order and dropping duplicates. */
export function mergePriceMaps(...maps: Partial<PriceMap>[]): PriceMap {
  const out = emptyPriceMap();
  for (const m of maps) {
    for (const key of Object.keys(out) as BillingProduct[]) {
      for (const id of m[key] ?? []) if (!out[key].includes(id)) out[key].push(id);
    }
  }
  return out;
}

/** A price ID may only belong to one product; ambiguity is a configuration error we refuse to guess about. */
export function findPriceConflicts(map: PriceMap): string[] {
  const seen = new Map<string, BillingProduct>();
  const conflicts: string[] = [];
  for (const key of Object.keys(map) as BillingProduct[]) {
    for (const id of map[key]) {
      const prev = seen.get(id);
      if (prev && prev !== key) conflicts.push(`${id} is listed for both ${prev} and ${key}`);
      seen.set(id, key);
    }
  }
  return conflicts;
}

export function productForPrice(map: PriceMap, priceId: string | null | undefined): BillingProduct | null {
  if (!priceId) return null;
  for (const key of Object.keys(map) as BillingProduct[]) if (map[key].includes(priceId)) return key;
  return null;
}

export function planForPrice(map: PriceMap, priceId: string | null | undefined): PaidPlan | null {
  const p = productForPrice(map, priceId);
  return p === "plus" || p === "pro" ? p : null;
}

/** The price new checkouts should use for a product, or null when none is configured. */
export function checkoutPrice(map: PriceMap, product: BillingProduct): string | null {
  return map[product][0] ?? null;
}

// ---------- Subscriptions ----------

/** Statuses that keep paid features on. past_due keeps access while Stripe retries the card. */
export const ENTITLED_STATUSES = ["active", "trialing", "past_due"] as const;
export function isEntitled(status: string | null | undefined) {
  return !!status && (ENTITLED_STATUSES as readonly string[]).includes(status);
}

/** Stripe never reactivates a subscription in these states. */
export function isTerminal(status: string | null | undefined) {
  return status === "canceled" || status === "incomplete_expired";
}

/**
 * Stripe can deliver events out of order (retries arrive late). A late "active" update must not
 * resurrect a subscription we already recorded as canceled.
 */
export function isStaleSubscriptionEvent(storedStatus: string | null | undefined, incomingStatus: string) {
  return isTerminal(storedStatus) && !isTerminal(incomingStatus);
}

// ---------- Invoices ----------

/** Minimal shape of the invoice fields we read; covers both older and newer Stripe API versions. */
export type InvoiceLike = {
  id: string;
  status?: string | null;
  billing_reason?: string | null;
  customer?: string | { id: string } | null;
  subscription?: string | { id: string } | null; // older API versions
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null; metadata?: Record<string, string> | null } | null;
  } | null;
  lines?: { data?: InvoiceLineLike[] } | null;
};

export type InvoiceLineLike = {
  amount?: number;
  proration?: boolean; // older API versions
  price?: { id: string } | null; // older API versions
  pricing?: { price_details?: { price?: string | null } | null } | null; // newer API versions
  parent?: { subscription_item_details?: { proration?: boolean | null } | null } | null;
};

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : v?.id ?? null);

export function invoiceSubscriptionId(inv: InvoiceLike): string | null {
  return idOf(inv.parent?.subscription_details?.subscription) ?? idOf(inv.subscription);
}

export function invoiceCustomerId(inv: InvoiceLike): string | null {
  return idOf(inv.customer);
}

/** user_id we stamp on subscriptions at checkout, copied by Stripe onto the invoice. */
export function invoiceUserId(inv: InvoiceLike): string | null {
  return inv.parent?.subscription_details?.metadata?.user_id || null;
}

export function linePriceId(line: InvoiceLineLike): string | null {
  return line.pricing?.price_details?.price ?? line.price?.id ?? null;
}

function isProrationLine(line: InvoiceLineLike) {
  return line.proration === true || line.parent?.subscription_item_details?.proration === true;
}

/** Plan of the invoice: the first non-proration line whose price maps to Plus or Pro. */
export function invoicePlan(inv: InvoiceLike, map: PriceMap): { plan: PaidPlan; priceId: string } | null {
  for (const line of inv.lines?.data ?? []) {
    if (isProrationLine(line)) continue;
    const priceId = linePriceId(line);
    const plan = planForPrice(map, priceId);
    if (plan && priceId) return { plan, priceId };
  }
  return null;
}

/** Price IDs on the invoice we could not map (used to decide whether to retry instead of silently skipping). */
export function unmappedInvoicePrices(inv: InvoiceLike, map: PriceMap): string[] {
  return (inv.lines?.data ?? [])
    .filter((l) => !isProrationLine(l))
    .map(linePriceId)
    .filter((id): id is string => !!id && !productForPrice(map, id));
}

/**
 * Monthly credits are granted for the first payment and each renewal only. Plan changes made in the
 * Customer Portal produce "subscription_update" proration invoices; granting on those would let
 * someone switch plans back and forth to collect extra monthly allowances.
 */
export const CREDIT_GRANTING_REASONS = ["subscription_create", "subscription_cycle"] as const;
export function invoiceGrantsMonthlyCredits(inv: InvoiceLike) {
  return (
    (inv.status == null || inv.status === "paid") &&
    !!inv.billing_reason &&
    (CREDIT_GRANTING_REASONS as readonly string[]).includes(inv.billing_reason)
  );
}

/** Idempotency keys: identical across webhook retries, resends and manual backfills, so credits land once. */
export const invoiceGrantKey = (invoiceId: string) => `invoice:${invoiceId}`;
export const packGrantKey = (checkoutSessionId: string) => `pack:${checkoutSessionId}`;

// ---------- Account deletion ----------

export type SubscriptionAction = "none" | "cancel_now" | "cancel_at_period_end";

/**
 * What to do with a subscription when its owner deletes their account.
 * - Good-standing subs (active/trialing) stop renewing at period end; no further charges.
 * - Subs whose payment failed (past_due/unpaid/incomplete) are canceled now so Stripe stops retrying the card.
 */
export function deletionActionFor(status: string, cancelAtPeriodEnd: boolean): SubscriptionAction {
  if (isTerminal(status)) return "none";
  if (status === "active" || status === "trialing") return cancelAtPeriodEnd ? "none" : "cancel_at_period_end";
  return "cancel_now";
}

// ---------- Refunds ----------

/** Credits a credit-pack refund should have taken back in total, given the cumulative refunded amount. */
export function packClawbackTarget(o: { packCredits: number; amountPaidCents: number; amountRefundedCents: number }) {
  if (o.amountPaidCents <= 0 || o.amountRefundedCents <= 0) return 0;
  const share = Math.min(1, o.amountRefundedCents / o.amountPaidCents);
  return Math.round(o.packCredits * share);
}

/**
 * Credits to take back NOW: what the refunds so far should have taken, minus what was already taken,
 * never more than the buyer still has (credits already spent on calls can't be un-spent).
 */
export function packClawbackDelta(o: { packCredits: number; amountPaidCents: number; amountRefundedCents: number; alreadyClawed: number; balance: number }) {
  const owed = packClawbackTarget(o) - o.alreadyClawed;
  return Math.max(0, Math.min(o.balance, owed));
}

/**
 * One ledger key per cumulative refunded amount: a resent Stripe event reuses the key (no double clawback),
 * while a second partial refund has a new cumulative amount and takes back only the difference.
 */
export const packClawbackKey = (checkoutSessionId: string, amountRefundedCents: number) => `packrefund:${checkoutSessionId}:${amountRefundedCents}`;
export const packClawbackPrefix = (checkoutSessionId: string) => `packrefund:${checkoutSessionId}:`;
