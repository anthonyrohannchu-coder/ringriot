import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMetrics, estimateCallCostUsd, isBot, isClientEvent, type EventRow } from "../src/lib/metrics";

const ev = (name: string, o: Partial<EventRow> = {}): EventRow => ({ name, visitor_id: null, user_id: null, ref: null, props: {}, ...o });

test("funnel, revenue, refunds, calls and per-creator attribution", () => {
  const events = [
    ev("page_view", { visitor_id: "a", ref: "aliza" }), ev("page_view", { visitor_id: "a", ref: "aliza" }),
    ev("page_view", { visitor_id: "b" }), ev("page_view", { visitor_id: "c" }), ev("page_view", { visitor_id: "d" }),
    ev("signup", { ref: "aliza" }), ev("signup"),
    ev("checkout_started"), ev("checkout_started"),
    ev("purchase", { ref: "aliza", props: { mode: "subscription", amount_usd: 9.99 } }),
    ev("refund", { props: { amount_usd: 4.99 } }),
    ev("call_completed", { props: { answered: true, seconds: 95, est_cost_usd: estimateCallCostUsd(95) } }),
    ev("call_completed", { props: { answered: false, est_cost_usd: 0 } }),
    ev("subscription_canceled"),
  ];
  const m = computeMetrics(events, [{ plan: "plus", status: "active", cancel_at_period_end: false }, { plan: "pro", status: "active", cancel_at_period_end: true }, { plan: "plus", status: "canceled", cancel_at_period_end: false }]);
  assert.equal(m.visitors, 4, "unique visitors, not page views");
  assert.equal(m.signups, 2);
  assert.equal(m.purchases, 1);
  assert.equal(m.revenueUsd, 9.99);
  assert.equal(m.refundsUsd, 4.99);
  assert.equal(m.callsCompleted, 1);
  assert.equal(m.callsUnanswered, 1);
  assert.equal(m.estCallCostUsd, 0.033);
  assert.equal(m.cancellations, 1);
  assert.equal(m.payingSubscribers, 2);
  assert.equal(m.cancelingAtPeriodEnd, 1);
  assert.equal(m.mrrUsd, 29.98);
  assert.deepEqual(m.byRef.aliza, { visits: 2, signups: 1, purchases: 1, revenue: 9.99 });
  assert.equal(m.conversion.visitToSignupPct, 50);
  assert.equal(m.conversion.checkoutToPaidPct, 50);
});

test("empty data gives zeros, not errors or NaN", () => {
  const m = computeMetrics([], []);
  assert.equal(m.visitors, 0);
  assert.equal(m.conversion.visitToSignupPct, null);
  assert.equal(m.mrrUsd, 0);
});

test("call cost uses per-started-minute Twilio rates", () => {
  assert.equal(estimateCallCostUsd(0), 0.0165);
  assert.equal(estimateCallCostUsd(61), 0.033);
});

test("only whitelisted client events; bots ignored", () => {
  assert.equal(isClientEvent("page_view"), true);
  assert.equal(isClientEvent("purchase"), false, "browsers can't fake purchases");
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)"), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)"), false);
});
