// Pure analytics math (unit-tested). Rows come from the events table, subscriptions and call data.

export const CLIENT_EVENTS = ["page_view", "demo_started", "pricing_view"] as const;
export type ClientEvent = (typeof CLIENT_EVENTS)[number];
export const isClientEvent = (n: unknown): n is ClientEvent => typeof n === "string" && (CLIENT_EVENTS as readonly string[]).includes(n);

/**
 * Page path safe to store: no query string or fragment, invite/referral codes replaced by a placeholder
 * (so a visit can't be tied back to the person who shared the link), at most 100 characters.
 */
export function cleanPath(p: unknown): string | null {
  if (typeof p !== "string" || !p.startsWith("/")) return null;
  return p.split(/[?#]/)[0].replace(/^\/(invite|r)\/[^/]+/, "/$1/:code").slice(0, 100);
}

const BOT = /bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|render\.com/i;
export const isBot = (ua: string | null | undefined) => !ua || BOT.test(ua);

/** Twilio cost estimate per call, from verified Oct 2026 US list prices (outbound $0.014/min + recording $0.0025/min, per started minute). */
export function estimateCallCostUsd(seconds: number) {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return Math.round(minutes * (0.014 + 0.0025) * 10000) / 10000;
}

export const PLAN_PRICE_USD = { plus: 9.99, pro: 19.99 } as const;

export type EventRow = { name: string; visitor_id: string | null; user_id: string | null; ref: string | null; props: Record<string, unknown> };
export type SubRow = { plan: string; status: string; cancel_at_period_end: boolean };

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : null);

export function computeMetrics(events: EventRow[], subs: SubRow[]) {
  const by = (n: string) => events.filter((e) => e.name === n);
  const visitors = new Set(by("page_view").map((e) => e.visitor_id).filter(Boolean)).size;
  const signups = by("signup").length;
  const checkouts = by("checkout_started").length;
  const purchases = by("purchase");
  const subsBought = purchases.filter((e) => e.props.mode === "subscription").length;
  const packsBought = purchases.filter((e) => e.props.mode === "payment").length;
  const revenue = purchases.reduce((s, e) => s + Number(e.props.amount_usd ?? 0), 0);
  const refunds = by("refund");
  const refunded = refunds.reduce((s, e) => s + Number(e.props.amount_usd ?? 0), 0);
  const calls = by("call_completed");
  const answered = calls.filter((e) => e.props.answered === true);
  const callCost = calls.reduce((s, e) => s + Number(e.props.est_cost_usd ?? 0), 0);
  const cancellations = by("subscription_canceled").length;

  const active = subs.filter((s) => ["active", "trialing", "past_due"].includes(s.status));
  const mrr = active.reduce((s, x) => s + (PLAN_PRICE_USD[x.plan as keyof typeof PLAN_PRICE_USD] ?? 0), 0);

  const refs = new Map<string, { visits: number; signups: number; purchases: number; revenue: number }>();
  for (const e of events) {
    if (!e.ref) continue;
    const r = refs.get(e.ref) ?? { visits: 0, signups: 0, purchases: 0, revenue: 0 };
    if (e.name === "page_view") r.visits++;
    if (e.name === "signup") r.signups++;
    if (e.name === "purchase") { r.purchases++; r.revenue += Number(e.props.amount_usd ?? 0); }
    refs.set(e.ref, r);
  }

  return {
    visitors, signups, checkouts,
    purchases: purchases.length, subscriptionsBought: subsBought, creditPacksBought: packsBought,
    revenueUsd: round(revenue), refundsUsd: round(refunded), refundCount: refunds.length,
    cancellations,
    callsCompleted: answered.length, callsUnanswered: calls.length - answered.length, estCallCostUsd: Math.round(callCost * 10000) / 10000,
    conversion: { visitToSignupPct: pct(signups, visitors), signupToPaidPct: pct(subsBought + packsBought, signups), checkoutToPaidPct: pct(purchases.length, checkouts) },
    payingSubscribers: active.length, cancelingAtPeriodEnd: active.filter((s) => s.cancel_at_period_end).length, mrrUsd: round(mrr),
    byRef: Object.fromEntries([...refs].map(([k, v]) => [k, { ...v, revenue: round(v.revenue) }])),
  };
}
const round = (n: number) => Math.round(n * 100) / 100;
