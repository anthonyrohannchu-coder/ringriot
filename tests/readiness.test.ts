// Launch-readiness rules: catch real misconfigurations and never leak secret values.
import { test } from "node:test";
import assert from "node:assert/strict";
import { envChecks, priceChecks, stripeKeyMode, summarize, twilioNumberCheck, webhookChecks, REQUIRED_WEBHOOK_EVENTS } from "../src/lib/readiness";

// Fake secrets (format-valid, not real).
const SECRETS = {
  SUPABASE_SERVICE_ROLE_KEY: "eyJfake.service.role.value",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJfake.anon.value",
  DEMO_COOKIE_SECRET: "f".repeat(64),
  STRIPE_SECRET_KEY: "sk_test_FAKEFAKEFAKEFAKE1234",
  STRIPE_WEBHOOK_SECRET: "whsec_FAKEFAKEFAKE",
  ANTHROPIC_API_KEY: "sk-ant-FAKEFAKEFAKE",
  TWILIO_AUTH_TOKEN: "fakeauthtoken0123456789abcdef",
};
const good = {
  ...SECRETS,
  NEXT_PUBLIC_SUPABASE_URL: "https://azfimpgjafvkkmsvceeq.supabase.co",
  NEXT_PUBLIC_APP_URL: "https://ringriot.onrender.com",
  STRIPE_PRICE_PLUS: "price_1USHt7KTWyAE5acuF4jA9jJ1",
  STRIPE_PRICE_PRO: "price_1USHt8KTWyAE5acu2VW0sAi8",
  STRIPE_PRICE_CREDITS_25: "price_1USHt9KTWyAE5acurqXvkb5l",
  TWILIO_ACCOUNT_SID: "AC" + "0".repeat(32),
  TWILIO_PHONE_NUMBERS: "+15555550100",
  ADMIN_EMAILS: "admin@example.test",
};

test("a complete configuration has no blockers, and no secret value appears anywhere in the output", () => {
  const checks = envChecks(good, "https://ringriot.onrender.com");
  assert.deepEqual(summarize(checks).blockers, []);
  const json = JSON.stringify(checks);
  for (const [k, v] of Object.entries(SECRETS)) assert.ok(!json.includes(v), `${k} value leaked`);
  assert.match(json, /test mode: real cards will NOT be charged/);
});

test("missing keys are blockers that say what breaks", () => {
  const s = summarize(envChecks({}, null));
  for (const id of ["SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_APP_URL", "STRIPE_SECRET_KEY", "ANTHROPIC_API_KEY", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_PHONE_NUMBERS", "DEMO_COOKIE_SECRET"]) {
    assert.ok(s.blockers.some((b) => b.includes(id)), id);
  }
  assert.equal(s.status, "blocked");
});

test("NEXT_PUBLIC_APP_URL must be https and match the site, or Twilio webhooks are rejected", () => {
  assert.ok(summarize(envChecks({ ...good, NEXT_PUBLIC_APP_URL: "http://ringriot.onrender.com" }, "https://ringriot.onrender.com")).blockers.some((b) => b.includes("https")));
  const mismatch = summarize(envChecks({ ...good, NEXT_PUBLIC_APP_URL: "https://ringriot-old.onrender.com" }, "https://ringriot.onrender.com"));
  assert.ok(mismatch.blockers.some((b) => b.startsWith("app_url_matches_host")));
});

test("scripted AI provider or missing AI key is a blocker for real calls", () => {
  assert.ok(summarize(envChecks({ ...good, AI_PROVIDER: "scripted" }, null)).blockers.some((b) => b.includes("scripted lines")));
  assert.ok(summarize(envChecks({ ...good, ANTHROPIC_API_KEY: "" }, null)).blockers.some((b) => b.includes("ANTHROPIC_API_KEY")));
});

test("caller numbers must be exact +1XXXXXXXXXX; bad entries are reported", () => {
  const c = envChecks({ ...good, TWILIO_PHONE_NUMBERS: "+15555550100, (555) 555-0101" }, null).find((x) => x.id === "env.TWILIO_PHONE_NUMBERS")!;
  assert.equal(c.ok, false);
  assert.match(c.detail, /1 usable, 1 ignored/);
  const none = envChecks({ ...good, TWILIO_PHONE_NUMBERS: "5555550100" }, null).find((x) => x.id === "env.TWILIO_PHONE_NUMBERS")!;
  assert.equal(none.severity, "blocker");
});

test("Stripe key mode is detected from the prefix only", () => {
  assert.equal(stripeKeyMode("sk_live_x"), "live");
  assert.equal(stripeKeyMode("rk_test_x"), "test");
  assert.equal(stripeKeyMode("sk_test_..."), "missing"); // .env.example placeholder
  assert.equal(stripeKeyMode(undefined), "missing");
});

test("price checks catch swapped Plus/Pro, wrong price types and test/live mixups", () => {
  const ok = [
    { product: "plus" as const, id: "price_a", active: true, recurring: "month", amount: 999, livemode: false },
    { product: "pro" as const, id: "price_b", active: true, recurring: "month", amount: 1999, livemode: false },
    { product: "credits_25" as const, id: "price_c", active: true, recurring: null, amount: 499, livemode: false },
  ];
  assert.deepEqual(summarize(priceChecks(ok, "test")).blockers, []);
  const swapped = [{ ...ok[0], amount: 1999 }, { ...ok[1], amount: 999 }, ok[2]];
  assert.ok(summarize(priceChecks(swapped, "test")).blockers.some((b) => b.includes("swapped")));
  assert.ok(summarize(priceChecks([ok[0], ok[1], { ...ok[2], recurring: "month" }], "test")).blockers.some((b) => b.includes("expected one-time")));
  assert.ok(summarize(priceChecks(ok, "live")).blockers.some((b) => b.includes("test price with a live key")));
  assert.ok(summarize(priceChecks([ok[0], ok[1]], "test")).blockers.some((b) => b.includes("credits_25")));
});

test("webhook checks: missing endpoint, missing events, duplicates", () => {
  const url = "https://ringriot.onrender.com/api/stripe/webhook";
  assert.equal(webhookChecks([], "https://ringriot.onrender.com")[0].ok, false);
  assert.equal(webhookChecks([{ url, status: "enabled", enabled_events: REQUIRED_WEBHOOK_EVENTS }], "https://ringriot.onrender.com")[0].ok, true);
  const missing = webhookChecks([{ url, status: "enabled", enabled_events: ["invoice.paid"] }], "https://ringriot.onrender.com")[0];
  assert.ok(!missing.ok && missing.detail.includes("checkout.session.completed"));
  assert.equal(webhookChecks([{ url, status: "enabled", enabled_events: ["*"] }], "https://ringriot.onrender.com")[0].ok, true);
  assert.equal(webhookChecks([{ url, status: "enabled", enabled_events: ["*"] }, { url, status: "enabled", enabled_events: ["*"] }], "https://ringriot.onrender.com")[0].severity, "warning");
});

test("Twilio number checks: ownership and SMS+voice capability", () => {
  assert.equal(twilioNumberCheck("+15555550100", null, "https://x").ok, false);
  assert.equal(twilioNumberCheck("+15555550100", { capabilities: { sms: true, voice: false } }, "https://x").ok, false);
  const ok = twilioNumberCheck("+15555550100", { capabilities: { sms: true, voice: true }, sms_url: "https://x/api/twilio/sms" }, "https://x");
  assert.ok(ok.ok && ok.detail.includes("point at this site"));
});
