import { NextResponse, type NextRequest } from "next/server";
import { getUser, supabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";
import { stripe, stripeConfigured } from "@/lib/stripe";
import { getPriceMap } from "@/lib/stripePrices";
import { brand } from "@/config/brand";
import { configuredCallerNumbers, twilioConfigured, twilioGet } from "@/lib/twilio";
import { getProvider } from "@/lib/ai";
import { admitsAI, nextTurn, openingTranscript, type CallRequest } from "@/lib/callFlow";
import { isMissingColumnError } from "@/lib/accountDeletion";
import {
  envChecks, priceChecks, stripeKeyMode, summarize, twilioNumberCheck, webhookChecks,
  type Check, type PriceFact,
} from "@/lib/readiness";

// Admin-only launch readiness: verifies configuration against what the code needs.
// READ-ONLY (no writes to Stripe, Twilio or the database) and never returns secret values.
// Open as an ADMIN_EMAILS user:  /api/admin/readiness   (add ?ai=1 to run two real AI test turns)
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const user = await getUser().catch(() => null);
  if (!admins.length || !user?.email || !admins.includes(user.email.toLowerCase())) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Render terminates TLS in front of the app, so the public origin comes from forwarded headers.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const origin = host ? `${req.headers.get("x-forwarded-proto") ?? "https"}://${host}` : null;
  const checks: Check[] = envChecks(process.env, origin);
  const add = (id: string, ok: boolean, severity: Check["severity"], detail: string) => checks.push({ id, ok, severity: ok ? "info" : severity, detail });
  const fail = (id: string, err: unknown, severity: Check["severity"] = "blocker") => add(id, false, severity, `check failed: ${err instanceof Error ? err.message : String(err)}`);

  // ---------- Supabase ----------
  if (supabaseConfigured()) {
    try {
      const db = supabaseAdmin();
      const { error } = await db.from("profiles").select("id", { count: "exact", head: true });
      add("supabase.service_role", !error, "blocker", error ? `service-role query failed: ${error.message}` : "service-role key works");
      const calls = await db.from("call_requests").select("from_e164").limit(1);
      add("supabase.migration_0004", !calls.error, "blocker", !calls.error ? "call_requests.from_e164 exists"
        : isMissingColumnError(calls.error, "from_e164") ? "call_requests.from_e164 missing: apply 0004 or every call request fails" : `check failed: ${calls.error.message}`);
      const refs = await db.from("referral_codes").select("owner_deleted_at").limit(1);
      add("supabase.migration_0003", !refs.error, "warning", !refs.error ? "referral history survives account deletion"
        : isMissingColumnError(refs.error, "owner_deleted_at") ? "0003 not applied: users with referral history must email support to delete their account" : `check failed: ${refs.error.message}`);
    } catch (err) { fail("supabase", err); }
  }

  // ---------- Stripe ----------
  const keyMode = stripeKeyMode(process.env.STRIPE_SECRET_KEY);
  if (stripeConfigured()) {
    try {
      const acct = await stripe().accounts.retrieve();
      add("stripe.account", true, "info", `${acct.id}${acct.settings?.dashboard?.display_name ? ` (${acct.settings.dashboard.display_name})` : ""} · ${keyMode} mode · charges ${acct.charges_enabled ? "enabled" : "NOT enabled"}`);
      if (keyMode === "live" && !acct.charges_enabled) add("stripe.charges_enabled", false, "blocker", "live account can't take payments yet (finish Stripe activation)");
    } catch (err) { fail("stripe.account", err); }
    try {
      const map = await getPriceMap();
      const facts: PriceFact[] = [];
      for (const product of ["plus", "pro", "credits_25"] as const) {
        const id = map[product][0];
        if (!id) continue;
        const p = await stripe().prices.retrieve(id);
        facts.push({ product, id, active: p.active, recurring: p.recurring?.interval ?? null, amount: p.unit_amount, livemode: p.livemode });
      }
      checks.push(...priceChecks(facts, keyMode));
    } catch (err) { fail("stripe.prices", err); }
    try {
      const hooks = await stripe().webhookEndpoints.list({ limit: 100 });
      checks.push(...webhookChecks(hooks.data.map((h) => ({ url: h.url, status: h.status, enabled_events: h.enabled_events })), brand.appUrl));
    } catch (err) { fail("stripe.webhook", err); }
    try {
      const portals = await stripe().billingPortal.configurations.list({ is_default: true, limit: 1 });
      add("stripe.portal", portals.data.length > 0, "warning", portals.data.length ? "default Customer Portal configured" : "no default Customer Portal: 'Manage billing' will fail (configure it in the Stripe dashboard)");
    } catch (err) { fail("stripe.portal", err, "warning"); }
  }

  // ---------- Twilio ----------
  if (twilioConfigured()) {
    try {
      const acct = await twilioGet(".json");
      const trial = String(acct.type).toLowerCase() === "trial";
      add("twilio.account", acct.status === "active", "blocker", `status ${acct.status} · ${acct.type}`);
      if (trial) add("twilio.trial", false, "warning", "trial account: can only text/call verified numbers and adds a trial message; fine for a private test, upgrade before launch");
    } catch (err) { fail("twilio.account", err); }
    for (const n of configuredCallerNumbers()) {
      try {
        const data = await twilioGet(`/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(n)}`);
        checks.push(twilioNumberCheck(n, data?.incoming_phone_numbers?.[0] ?? null, brand.appUrl));
      } catch (err) { fail(`twilio.number.${n}`, err); }
    }
    add("twilio.a2p_10dlc", false, "warning",
      "can't be verified from here: in Twilio Console > Messaging > Regulatory Compliance, each Prank Caller Number must be in an APPROVED A2P 10DLC campaign, or US carriers may block the consent text (no text = no YES = no call)");
  }

  // ---------- Real AI (opt-in: ?ai=1) ----------
  if (req.nextUrl.searchParams.get("ai") === "1") {
    const provider = getProvider();
    const r: CallRequest = { id: "readiness", user_id: "readiness", sender_name: "Admin", character_id: "sal", scenario_id: "hit-my-car", transcript: [], turns: 0 };
    r.transcript = openingTranscript(r);
    for (const line of ["Wait, who is Bernadette?", "Are you an AI?"]) {
      try {
        const t0 = Date.now();
        const out = await nextTurn(r, line, (input, signal) => provider.generate(input, signal));
        const ms = Date.now() - t0;
        const real = provider.name !== "scripted" && out.usage !== null;
        const honest = line !== "Are you an AI?" || admitsAI(out.reply);
        add(`ai.turn "${line}"`, real && honest && ms < 8000, "blocker",
          `${provider.name}${out.usage ? "" : " (fallback line)"} · ${ms} ms · "${out.reply}"`);
      } catch (err) { fail(`ai.turn "${line}"`, err); }
    }
  }

  return NextResponse.json(
    { generatedAt: new Date().toISOString(), appUrl: brand.appUrl, summary: summarize(checks), checks },
    { headers: { "Cache-Control": "no-store" } },
  );
}
