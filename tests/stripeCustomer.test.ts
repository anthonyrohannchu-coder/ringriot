import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingCustomerError, usableCustomerId } from "../src/lib/stripeCustomer";

const testModeErr = Object.assign(new Error("No such customer: 'cus_X'; a similar object exists in test mode, but a live mode key was used to make this request."), { code: "resource_missing", type: "StripeInvalidRequestError" });

test("a test-mode customer id is treated as missing in live mode", async () => {
  assert.equal(isMissingCustomerError(testModeErr), true);
  assert.equal(await usableCustomerId("cus_X", async () => { throw testModeErr; }), null);
});

test("deleted customers are replaced; real ones are kept", async () => {
  assert.equal(await usableCustomerId("cus_D", async () => ({ deleted: true })), null);
  assert.equal(await usableCustomerId("cus_OK", async () => ({})), "cus_OK");
  assert.equal(await usableCustomerId(null, async () => { throw new Error("should not be called"); }), null);
});

test("other Stripe errors still surface", async () => {
  const outage = Object.assign(new Error("api down"), { code: "api_error" });
  assert.equal(isMissingCustomerError(outage), false);
  await assert.rejects(usableCustomerId("cus_Y", async () => { throw outage; }), /api down/);
});
