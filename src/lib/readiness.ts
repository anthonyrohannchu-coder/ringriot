// Launch-readiness rules. Pure functions: given env values / provider facts, return checks.
// SECRET VALUES ARE NEVER RETURNED: only presence, format, mode (test/live) and public identifiers.
import { parsePriceList } from "./billing";

export type Severity = "blocker" | "warning" | "info";
export type Check = { id: string; ok: boolean; severity: Severity; detail: string };

const has = (v: string | undefined) => !!v && v.trim().length > 0 && !/\.\.\.$/.test(v.trim());
const check = (id: string, ok: boolean, severity: Severity, detail: string): Check => ({ id, ok, severity: ok ? "info" : severity, detail });

export function stripeKeyMode(key: string | undefined): "live" | "test" | "missing" | "unknown" {
  if (!has(key)) return "missing";
  if (/^(sk|rk)_live_/.test(key!)) return "live";
  if (/^(sk|rk)_test_/.test(key!)) return "test";
  return "unknown";
}

/** Env checks against what the code actually reads. `origin` = the URL this request arrived on. */
export function envChecks(env: Record<string, string | undefined>, origin: string | null): Check[] {
  const out: Check[] = [];
  const appUrl = env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");

  for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    out.push(check(`env.${k}`, has(env[k]), "blocker", has(env[k]) ? "set" : "missing: login, database and webhooks fail"));
  }

  out.push(check("env.NEXT_PUBLIC_APP_URL", has(appUrl) && appUrl!.startsWith("https://"), "blocker",
    has(appUrl) ? (appUrl!.startsWith("https://") ? `set (${appUrl})` : `must be https:// for Twilio/Stripe (${appUrl})`) : "missing: Twilio signatures and checkout redirects fail"));
  if (has(appUrl) && origin) {
    out.push(check("app_url_matches_host", appUrl === origin.replace(/\/+$/, ""), "blocker",
      appUrl === origin.replace(/\/+$/, "") ? "matches this site" : `NEXT_PUBLIC_APP_URL (${appUrl}) differs from this site (${origin}): every Twilio webhook will be rejected as unsigned. NEXT_PUBLIC_* values are baked in at build time; redeploy after changing.`));
  }

  const demo = env.DEMO_COOKIE_SECRET ?? "";
  out.push(check("env.DEMO_COOKIE_SECRET", demo.length >= 32, "blocker",
    demo.length >= 32 ? "set (never change it after launch: it keys the STOP/opt-out list and call links)" : has(demo) ? "too short (use openssl rand -hex 32)" : "missing: the opt-out list and signed call links use an insecure default"));

  const mode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  out.push(check("env.STRIPE_SECRET_KEY", mode === "live" || mode === "test", "blocker",
    mode === "missing" ? "missing: checkout disabled" : mode === "unknown" ? "unrecognised format" : `set (${mode} mode${mode === "test" ? ": real cards will NOT be charged" : ""})`));
  out.push(check("env.STRIPE_WEBHOOK_SECRET", has(env.STRIPE_WEBHOOK_SECRET) && env.STRIPE_WEBHOOK_SECRET!.startsWith("whsec_"), "warning",
    has(env.STRIPE_WEBHOOK_SECRET) ? "set (match it to the endpoint by sending a test event)" : "missing: events are re-fetched from Stripe instead of signature-verified"));
  for (const [k, label] of [["STRIPE_PRICE_PLUS", "Plus"], ["STRIPE_PRICE_PRO", "Pro"], ["STRIPE_PRICE_CREDITS_25", "credit pack"]] as const) {
    const ids = parsePriceList(env[k]);
    out.push(check(`env.${k}`, ids.length > 0, "warning",
      ids.length ? `${ids.length} price id(s): ${ids.join(", ")}` : `not set: ${label} only works if a price with the matching lookup key exists`));
  }

  const aiKey = has(env.ANTHROPIC_API_KEY);
  const scripted = (env.AI_PROVIDER || "anthropic") !== "anthropic";
  out.push(check("env.ANTHROPIC_API_KEY", aiKey && !scripted, "blocker",
    scripted ? `AI_PROVIDER=${env.AI_PROVIDER}: calls use scripted lines, not real AI` : aiKey ? `set (model ${env.ANTHROPIC_MODEL || "claude-haiku-5-5"})` : "missing: calls fall back to scripted lines that can't hold a conversation"));

  out.push(check("env.TWILIO_ACCOUNT_SID", has(env.TWILIO_ACCOUNT_SID) && /^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID!.trim()), "blocker",
    has(env.TWILIO_ACCOUNT_SID) ? (/^AC[0-9a-f]{32}$/i.test(env.TWILIO_ACCOUNT_SID!.trim()) ? "set" : "set but not an AC… account SID") : "missing: real calls are switched off"));
  out.push(check("env.TWILIO_AUTH_TOKEN", has(env.TWILIO_AUTH_TOKEN), "blocker", has(env.TWILIO_AUTH_TOKEN) ? "set" : "missing: real calls are switched off and webhooks can't be verified"));
  const raw = (env.TWILIO_PHONE_NUMBERS || env.TWILIO_PHONE_NUMBER || "").split(",").map((s) => s.trim()).filter(Boolean);
  const valid = raw.filter((n) => /^\+1\d{10}$/.test(n));
  const invalid = raw.filter((n) => !/^\+1\d{10}$/.test(n));
  out.push(check("env.TWILIO_PHONE_NUMBERS", valid.length > 0 && invalid.length === 0, valid.length ? "warning" : "blocker",
    !raw.length ? "missing: no Prank Caller Number to offer"
      : invalid.length ? `${valid.length} usable, ${invalid.length} ignored (must be exactly +1XXXXXXXXXX): ${invalid.join(", ")}`
      : `${valid.length} number(s): ${valid.join(", ")}`));

  out.push(check("env.ADMIN_EMAILS", has(env.ADMIN_EMAILS), "info", has(env.ADMIN_EMAILS) ? "set" : "not set"));
  out.push(check("env.ELEVENLABS_API_KEY", true, "info", has(env.ELEVENLABS_API_KEY) ? "set: calls use ElevenLabs voices" : "not set: calls use Amazon Polly voices (fine)"));
  return out;
}

export type PriceFact = { product: "plus" | "pro" | "credits_25"; id: string; active: boolean; recurring: string | null; amount: number | null; livemode: boolean };

/** Catches swapped or wrong prices (e.g. Pro id in STRIPE_PRICE_PLUS) and test/live mixups. */
export function priceChecks(prices: PriceFact[], keyMode: string): Check[] {
  const out: Check[] = [];
  const first = (p: PriceFact["product"]) => prices.find((x) => x.product === p);
  for (const p of ["plus", "pro", "credits_25"] as const) {
    const f = first(p);
    if (!f) { out.push(check(`stripe.price.${p}`, false, "blocker", "no price resolved: checkout for this product is off")); continue; }
    const wantRecurring = p !== "credits_25";
    const problems = [
      !f.active && "inactive",
      wantRecurring && f.recurring !== "month" && `expected monthly recurring, got ${f.recurring ?? "one-time"}`,
      !wantRecurring && f.recurring && "expected one-time, got recurring",
      (keyMode === "live") !== f.livemode && `${f.livemode ? "live" : "test"} price with a ${keyMode} key`,
    ].filter(Boolean);
    out.push(check(`stripe.price.${p}`, problems.length === 0, "blocker",
      `${f.id} · ${f.amount != null ? `$${(f.amount / 100).toFixed(2)}` : "?"}${f.recurring ? `/${f.recurring}` : " one-time"}${problems.length ? ` · ${problems.join("; ")}` : ""}`));
  }
  const plus = first("plus"), pro = first("pro");
  if (plus?.amount != null && pro?.amount != null) {
    out.push(check("stripe.prices_not_swapped", plus.amount < pro.amount, "blocker",
      plus.amount < pro.amount ? "Plus costs less than Pro" : "Plus costs the same or more than Pro: are STRIPE_PRICE_PLUS and STRIPE_PRICE_PRO swapped?"));
  }
  return out;
}

export const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed", "customer.subscription.created", "customer.subscription.updated",
  "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded",
];

export function webhookChecks(endpoints: { url: string; status: string; enabled_events: string[] }[], appUrl: string): Check[] {
  const target = `${appUrl.replace(/\/+$/, "")}/api/stripe/webhook`;
  const mine = endpoints.filter((e) => e.url === target);
  if (!mine.length) return [check("stripe.webhook", false, "blocker", `no webhook endpoint for ${target} in the Stripe account this key belongs to: payments won't grant plans or credits`)];
  if (mine.length > 1) return [check("stripe.webhook", false, "warning", `${mine.length} endpoints for ${target}: events arrive more than once (deduplicated, but only one signing secret can match)`)];
  const e = mine[0];
  const missing = e.enabled_events.includes("*") ? [] : REQUIRED_WEBHOOK_EVENTS.filter((x) => !e.enabled_events.includes(x));
  return [check("stripe.webhook", e.status === "enabled" && missing.length === 0, "blocker",
    `${target} · ${e.status}${missing.length ? ` · missing events: ${missing.join(", ")}` : " · all required events"}`)];
}

export function twilioNumberCheck(number: string, found: { capabilities?: { sms?: boolean; voice?: boolean }; sms_url?: string } | null, appUrl: string): Check {
  if (!found) return check(`twilio.number.${number}`, false, "blocker", "not a phone number on this Twilio account: texts and calls from it will fail");
  const smsUrl = `${appUrl.replace(/\/+$/, "")}/api/twilio/sms`;
  const problems = [!found.capabilities?.sms && "no SMS capability", !found.capabilities?.voice && "no voice capability"].filter(Boolean);
  const note = found.sms_url === smsUrl ? "incoming texts point at this site" : "incoming-text webhook will be pointed at this site on the first call request";
  return check(`twilio.number.${number}`, problems.length === 0, "blocker", problems.length ? problems.join("; ") : `owned · SMS + voice · ${note}`);
}

export function summarize(checks: Check[]) {
  const blockers = checks.filter((c) => !c.ok && c.severity === "blocker");
  const warnings = checks.filter((c) => !c.ok && c.severity === "warning");
  return {
    status: blockers.length ? "blocked" : warnings.length ? "ok_with_warnings" : "ok",
    blockers: blockers.map((c) => `${c.id}: ${c.detail}`),
    warnings: warnings.map((c) => `${c.id}: ${c.detail}`),
  };
}
