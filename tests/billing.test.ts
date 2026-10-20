// Unit tests for src/lib/billing.ts. Run: npm test (uses Node's built-in test runner via tsx).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutPrice, deletionActionFor, findPriceConflicts, invoiceCustomerId, invoiceGrantKey,
  invoiceGrantsMonthlyCredits, invoicePlan, invoiceSubscriptionId, invoiceUserId, isEntitled,
  isStaleSubscriptionEvent, mergePriceMaps, parsePriceList, planForPrice, productForPrice,
  unmappedInvoicePrices, type InvoiceLike, type PriceMap,
} from "../src/lib/billing";

// The three prices that exist in the Stripe sandbox (test mode).
const SANDBOX = {
  plus: "price_1USHt7KTWyAE5acuF4jA9jJ1",
  pro: "price_1USHt8KTWyAE5acu2VW0sAi8",
  credits_25: "price_1USHt9KTWyAE5acurqXvkb5l",
};
const map: PriceMap = { plus: [SANDBOX.plus], pro: [SANDBOX.pro], credits_25: [SANDBOX.credits_25] };

// Trimmed copy of the real invoice.paid payload in_1USIfPKTWyAE5acukAnAg27o (API 2026-04-22.dahlia).
const realInvoice: InvoiceLike = {
  id: "in_1USIfPKTWyAE5acukAnAg27o",
  status: "paid",
  billing_reason: "subscription_create",
  customer: "cus_VTF9HzrjhLIVZP",
  parent: {
    subscription_details: {
      metadata: { user_id: "d879b3c5-cb32-466d-b40d-869d6d191fe6" },
      subscription: "sub_1USIfPKTWyAE5acu1BiHKQQV",
    },
  },
  lines: {
    data: [
      {
        amount: 999,
        parent: { subscription_item_details: { proration: false } },
        pricing: { price_details: { price: SANDBOX.plus } },
      },
    ],
  },
};

test("parsePriceList accepts comma lists and drops placeholders/blanks/duplicates", () => {
  assert.deepEqual(parsePriceList(" price_a , price_b,,price_a "), ["price_a", "price_b"]);
  assert.deepEqual(parsePriceList("price_..."), []); // .env.example placeholder style
  assert.deepEqual(parsePriceList(""), []);
  assert.deepEqual(parsePriceList(undefined), []);
  assert.deepEqual(parsePriceList("prod_123,sk_test_abc"), []);
});

test("sandbox price IDs map to the right plan / pack", () => {
  assert.equal(planForPrice(map, SANDBOX.plus), "plus");
  assert.equal(planForPrice(map, SANDBOX.pro), "pro");
  assert.equal(planForPrice(map, SANDBOX.credits_25), null); // a pack is not a plan
  assert.equal(productForPrice(map, SANDBOX.credits_25), "credits_25");
  assert.equal(planForPrice(map, "price_unknown"), null);
  assert.equal(planForPrice(map, null), null);
});

test("older price IDs stay mapped; first ID is used for checkout", () => {
  const m = mergePriceMaps({ plus: ["price_new", SANDBOX.plus] }, { plus: ["price_lookup", "price_new"] });
  assert.deepEqual(m.plus, ["price_new", SANDBOX.plus, "price_lookup"]);
  assert.equal(checkoutPrice(m, "plus"), "price_new");
  assert.equal(planForPrice(m, SANDBOX.plus), "plus");
  assert.equal(planForPrice(m, "price_lookup"), "plus");
  assert.equal(checkoutPrice(m, "pro"), null);
});

test("a price listed under two products is reported as a conflict", () => {
  assert.deepEqual(findPriceConflicts(map), []);
  const bad = mergePriceMaps(map, { pro: [SANDBOX.plus] });
  assert.equal(findPriceConflicts(bad).length, 1);
});

test("real sandbox invoice: Plus, grants monthly credits, ids resolved", () => {
  assert.deepEqual(invoicePlan(realInvoice, map), { plan: "plus", priceId: SANDBOX.plus });
  assert.equal(invoiceGrantsMonthlyCredits(realInvoice), true);
  assert.equal(invoiceSubscriptionId(realInvoice), "sub_1USIfPKTWyAE5acu1BiHKQQV");
  assert.equal(invoiceCustomerId(realInvoice), "cus_VTF9HzrjhLIVZP");
  assert.equal(invoiceUserId(realInvoice), "d879b3c5-cb32-466d-b40d-869d6d191fe6");
  assert.equal(invoiceGrantKey(realInvoice.id), "invoice:in_1USIfPKTWyAE5acukAnAg27o");
});

test("same invoice (retry/resend) always yields the same idempotency key", () => {
  const retry = structuredClone(realInvoice);
  assert.equal(invoiceGrantKey(retry.id), invoiceGrantKey(realInvoice.id));
});

test("the OLD bug: with no lookup keys and no env mapping, the invoice is unmapped (now an error, not a downgrade)", () => {
  const none: PriceMap = { plus: [], pro: [], credits_25: [] };
  assert.equal(invoicePlan(realInvoice, none), null);
  assert.deepEqual(unmappedInvoicePrices(realInvoice, none), [SANDBOX.plus]);
});

test("renewals grant; plan-change proration invoices do not", () => {
  assert.equal(invoiceGrantsMonthlyCredits({ ...realInvoice, billing_reason: "subscription_cycle" }), true);
  assert.equal(invoiceGrantsMonthlyCredits({ ...realInvoice, billing_reason: "subscription_update" }), false);
  assert.equal(invoiceGrantsMonthlyCredits({ ...realInvoice, billing_reason: "manual" }), false);
  assert.equal(invoiceGrantsMonthlyCredits({ ...realInvoice, billing_reason: null }), false);
  assert.equal(invoiceGrantsMonthlyCredits({ ...realInvoice, status: "open" }), false);
});

test("proration lines are ignored when choosing the plan", () => {
  const upgrade: InvoiceLike = {
    ...realInvoice,
    lines: {
      data: [
        { amount: -500, parent: { subscription_item_details: { proration: true } }, pricing: { price_details: { price: SANDBOX.plus } } },
        { amount: 1999, parent: { subscription_item_details: { proration: false } }, pricing: { price_details: { price: SANDBOX.pro } } },
      ],
    },
  };
  assert.deepEqual(invoicePlan(upgrade, map), { plan: "pro", priceId: SANDBOX.pro });
});

test("older Stripe API invoice shape is understood", () => {
  const legacy: InvoiceLike = {
    id: "in_legacy",
    status: "paid",
    billing_reason: "subscription_cycle",
    customer: { id: "cus_1" },
    subscription: "sub_legacy",
    lines: { data: [{ amount: 1999, proration: false, price: { id: SANDBOX.pro } }] },
  };
  assert.equal(invoiceSubscriptionId(legacy), "sub_legacy");
  assert.equal(invoiceCustomerId(legacy), "cus_1");
  assert.deepEqual(invoicePlan(legacy, map), { plan: "pro", priceId: SANDBOX.pro });
});

test("non-subscription invoices are recognised as such", () => {
  assert.equal(invoiceSubscriptionId({ id: "in_x", lines: { data: [] } }), null);
});

test("entitlement and out-of-order protection", () => {
  assert.ok(isEntitled("active") && isEntitled("trialing") && isEntitled("past_due"));
  assert.ok(!isEntitled("canceled") && !isEntitled("unpaid") && !isEntitled("incomplete") && !isEntitled(null));
  assert.equal(isStaleSubscriptionEvent("canceled", "active"), true); // late update after deletion
  assert.equal(isStaleSubscriptionEvent("active", "past_due"), false);
  assert.equal(isStaleSubscriptionEvent(null, "active"), false); // first time we see it
  assert.equal(isStaleSubscriptionEvent("canceled", "canceled"), false);
});

test("account deletion: stop renewals for paid periods, cancel failed-payment subs now", () => {
  assert.equal(deletionActionFor("active", false), "cancel_at_period_end");
  assert.equal(deletionActionFor("trialing", false), "cancel_at_period_end");
  assert.equal(deletionActionFor("active", true), "none"); // already won't renew
  assert.equal(deletionActionFor("past_due", false), "cancel_now");
  assert.equal(deletionActionFor("unpaid", false), "cancel_now");
  assert.equal(deletionActionFor("incomplete", false), "cancel_now");
  assert.equal(deletionActionFor("canceled", false), "none");
});

