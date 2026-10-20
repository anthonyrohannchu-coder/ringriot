// Credit-pack refunds against a fake ledger that behaves like the real SQL functions:
// reserve_credits is idempotent per key and never lets a balance go below zero.
import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { handlePackRefund, type RefundCharge, type RefundDeps } from "../src/lib/refunds";
import { packClawbackTarget } from "../src/lib/billing";

function ledger(startBalance: number, sessionProduct: string | null = "credits_25") {
  let balance = startBalance;
  const tx = new Map<string, { id: string; amount: number; status: string }>();
  const deps: RefundDeps = {
    packCredits: 25,
    findSession: async () => (sessionProduct === null ? null : { id: "cs_test_1", userId: "u1", product: sessionProduct }),
    balance: async () => balance,
    clawedSoFar: async (_u, prefix) => [...tx.entries()].filter(([k]) => k.startsWith(prefix)).reduce((s, [, t]) => s - t.amount, 0),
    reserve: async (_u, amount, key) => {
      const existing = tx.get(key);
      if (existing) return { ok: true, transaction_id: existing.id }; // same key: no second deduction
      if (balance < amount) return { ok: false, transaction_id: null };
      balance -= amount;
      const t = { id: `tx${tx.size + 1}`, amount: -amount, status: "reserved" };
      tx.set(key, t);
      return { ok: true, transaction_id: t.id };
    },
    settle: async (id) => { for (const t of tx.values()) if (t.id === id) t.status = "settled"; },
  };
  return { deps, get balance() { return balance; }, tx };
}
const charge = (refunded: number, extra: Partial<RefundCharge> = {}): RefundCharge => ({ id: "ch_1", amount: 499, amount_refunded: refunded, invoice: null, payment_intent: "pi_1", ...extra });

test("full refund of an unspent pack takes back all 25 credits", async () => {
  const l = ledger(25);
  const out = await handlePackRefund(charge(499), l.deps);
  assert.deepEqual(out, { action: "clawed_back", credits: 25, key: "packrefund:cs_test_1:499" });
  assert.equal(l.balance, 0);
  assert.equal([...l.tx.values()][0].status, "settled");
});

test("the same refund event delivered twice takes credits only once", async () => {
  const l = ledger(40);
  await handlePackRefund(charge(499), l.deps);
  const again = await handlePackRefund(charge(499), l.deps);
  assert.equal(again.action, "nothing_to_take");
  assert.equal(l.balance, 15, "40 - 25, not 40 - 50");
  assert.equal(l.tx.size, 1);
});

test("two partial refunds take back only the difference each time", async () => {
  const l = ledger(40);
  const first = await handlePackRefund(charge(250), l.deps);  // ~half
  assert.equal(first.action === "clawed_back" && first.credits, 13);
  const second = await handlePackRefund(charge(499), l.deps); // now fully refunded
  assert.equal(second.action === "clawed_back" && second.credits, 12);
  assert.equal(l.balance, 15, "25 total taken, not 38");
});

test("credits already spent on calls are not taken below zero", async () => {
  const l = ledger(10);
  const out = await handlePackRefund(charge(499), l.deps);
  assert.equal(out.action === "clawed_back" && out.credits, 10);
  assert.equal(l.balance, 0);
  const later = await handlePackRefund(charge(499), l.deps); // resent: still nothing more to take
  assert.equal(later.action, "nothing_to_take");
  assert.equal(l.balance, 0);
});

test("subscription refunds and non-pack payments are left alone", async () => {
  const l = ledger(40);
  assert.equal((await handlePackRefund(charge(999, { invoice: "in_1" }), l.deps)).action, "ignored");
  assert.equal((await handlePackRefund(charge(499), ledger(40, "plus").deps)).action, "ignored");
  assert.equal((await handlePackRefund(charge(499), ledger(40, null).deps)).action, "ignored");
  assert.equal((await handlePackRefund(charge(499, { payment_intent: null }), l.deps)).action, "ignored");
  assert.equal(l.balance, 40);
});

test("a $0 refund or $0 payment takes nothing", () => {
  assert.equal(packClawbackTarget({ packCredits: 25, amountPaidCents: 499, amountRefundedCents: 0 }), 0);
  assert.equal(packClawbackTarget({ packCredits: 25, amountPaidCents: 0, amountRefundedCents: 499 }), 0);
});
