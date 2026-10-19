// Unit tests for src/lib/accountDeletion.ts: the ordering, blocking and rollback rules of account deletion.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingColumnError, runAccountDeletion, type DeletionDeps, type DeletionSub } from "../src/lib/accountDeletion";

const LATER = "2026-11-19T15:40:03.000Z";
const active = (id: string, extra: Partial<DeletionSub> = {}): DeletionSub =>
  ({ id, status: "active", cancel_at_period_end: false, current_period_end: LATER, ...extra });

/** Fake deps that record every call; individual operations can be made to fail. */
function fake(opts: {
  subs?: DeletionSub[];
  blockers?: string[];
  failList?: boolean;
  failBlockers?: boolean;
  failStopFor?: string[];
  failRestoreFor?: string[];
  failDelete?: boolean;
  failCancelNowFor?: string[];
  billingAvailable?: boolean;
}) {
  const calls: string[] = [];
  const audits: { action: string; detail: Record<string, unknown> }[] = [];
  const state = { deleted: false, renewalOff: new Set<string>(), canceled: new Set<string>() };
  const deps: DeletionDeps = {
    billingAvailable: opts.billingAvailable ?? true,
    async listSubscriptions() {
      calls.push("list");
      if (opts.failList) throw new Error("stripe down");
      return opts.subs ?? [];
    },
    async findBlockers() {
      calls.push("blockers");
      if (opts.failBlockers) throw new Error("db down");
      return opts.blockers ?? [];
    },
    async setCancelAtPeriodEnd(id, value) {
      calls.push(`setCancelAtPeriodEnd:${id}:${value}`);
      if (value && opts.failStopFor?.includes(id)) throw new Error("stripe error");
      if (!value && opts.failRestoreFor?.includes(id)) throw new Error("stripe error");
      if (value) state.renewalOff.add(id); else state.renewalOff.delete(id);
    },
    async cancelNow(id) {
      calls.push(`cancelNow:${id}`);
      if (opts.failCancelNowFor?.includes(id)) throw new Error("stripe error");
      state.canceled.add(id);
    },
    async deleteUser() {
      calls.push("deleteUser");
      if (opts.failDelete) throw new Error('violates foreign key constraint "referral_conversions_code_fkey"');
      state.deleted = true;
    },
    async audit(action, detail) {
      audits.push({ action, detail });
    },
  };
  const stripeWrites = () => calls.filter((c) => c.startsWith("setCancelAtPeriodEnd") || c.startsWith("cancelNow"));
  return { deps, calls, audits, state, stripeWrites };
}

test("account without referrals or subscriptions is deleted", async () => {
  const f = fake({});
  const r = await runAccountDeletion(f.deps, { confirmForfeit: false });
  assert.deepEqual(r, { ok: true, warnings: [] });
  assert.equal(f.state.deleted, true);
  assert.deepEqual(f.stripeWrites(), []);
});

test("account with referral conversions (pre-migration) is blocked BEFORE any subscription is touched", async () => {
  const f = fake({ subs: [active("sub_1")], blockers: ["referrer_has_conversions"] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.equal(r.ok, false);
  assert.ok(!r.ok && r.status === 409 && r.error === "deletion_blocked");
  assert.ok(!r.ok && r.blockers?.includes("referrer_has_conversions"));
  assert.deepEqual(f.stripeWrites(), [], "no Stripe changes");
  assert.equal(f.state.deleted, false);
  assert.deepEqual(f.calls, ["list", "blockers"]);
});

test("referred user with a conversion (pre-migration) is also blocked, so the referrer's history isn't erased", async () => {
  const f = fake({ blockers: ["referred_user_has_conversion"] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(!r.ok && r.error === "deletion_blocked");
  assert.equal(f.state.deleted, false);
});

test("after migration (no blockers) an account with referral history is deleted", async () => {
  const f = fake({ subs: [active("sub_1")], blockers: [] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(r.ok);
  assert.equal(f.state.deleted, true);
});

test("running paid period: asks first and changes nothing until confirmed", async () => {
  const f = fake({ subs: [active("sub_1")] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: false });
  assert.deepEqual(r, { ok: false, status: 409, error: "active_subscription", paidThrough: LATER });
  assert.deepEqual(f.stripeWrites(), []);
  assert.equal(f.state.deleted, false);
});

test("confirmed: renewal stopped first, then account deleted", async () => {
  const f = fake({ subs: [active("sub_1")] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(r.ok);
  assert.deepEqual(f.calls, ["list", "blockers", "setCancelAtPeriodEnd:sub_1:true", "deleteUser"]);
});

test("deletion fails AFTER the cancellation attempt: renewal is restored, account untouched, nothing audited", async () => {
  const f = fake({ subs: [active("sub_1"), active("sub_2")], failDelete: true });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(!r.ok && r.status === 500 && r.error === "delete_failed");
  assert.ok(!r.ok && /Nothing was changed/.test(r.message ?? ""));
  assert.equal(f.state.deleted, false);
  assert.equal(f.state.renewalOff.size, 0, "both subscriptions renew again");
  assert.deepEqual(f.calls, [
    "list", "blockers",
    "setCancelAtPeriodEnd:sub_1:true", "setCancelAtPeriodEnd:sub_2:true",
    "deleteUser",
    "setCancelAtPeriodEnd:sub_1:false", "setCancelAtPeriodEnd:sub_2:false",
  ]);
  assert.deepEqual(f.audits, []);
});

test("deletion fails and the rollback also fails: user is told, and it's recorded for follow-up", async () => {
  const f = fake({ subs: [active("sub_1")], failDelete: true, failRestoreFor: ["sub_1"] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(!r.ok && r.error === "delete_failed" && /Manage billing/.test(r.message ?? ""));
  assert.equal(f.state.deleted, false);
  assert.deepEqual(f.audits, [{ action: "account_deletion_rollback_failed", detail: { stage: "delete_user", subscriptions: ["sub_1"] } }]);
});

test("Stripe fails on the 2nd subscription: the 1st is restored and the account is not deleted", async () => {
  const f = fake({ subs: [active("sub_1"), active("sub_2")], failStopFor: ["sub_2"] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(!r.ok && r.error === "billing_update_failed");
  assert.equal(f.state.deleted, false);
  assert.equal(f.state.renewalOff.size, 0);
  assert.ok(!f.calls.includes("deleteUser"));
});

test("failed-payment subscriptions are canceled only AFTER the account is deleted", async () => {
  const f = fake({ subs: [{ id: "sub_pd", status: "past_due", cancel_at_period_end: false, current_period_end: LATER }] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: false }); // past_due isn't a paid period to forfeit
  assert.ok(r.ok);
  assert.deepEqual(f.calls, ["list", "blockers", "deleteUser", "cancelNow:sub_pd"]);
});

test("if deletion fails, a failed-payment subscription is never canceled", async () => {
  const f = fake({ subs: [{ id: "sub_pd", status: "past_due", cancel_at_period_end: false, current_period_end: LATER }], failDelete: true });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: false });
  assert.ok(!r.ok);
  assert.ok(!f.calls.some((c) => c.startsWith("cancelNow")));
});

test("cancel after deletion fails: deletion still reported, with an audit entry for follow-up", async () => {
  const f = fake({ subs: [{ id: "sub_pd", status: "unpaid", cancel_at_period_end: false, current_period_end: null }], failCancelNowFor: ["sub_pd"] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: false });
  assert.deepEqual(r, { ok: true, warnings: ["sub_pd"] });
  assert.deepEqual(f.audits, [{ action: "stripe_cancel_pending", detail: { subscription: "sub_pd", status: "unpaid" } }]);
});

test("already set to not renew / already canceled: no Stripe calls", async () => {
  const f = fake({ subs: [active("sub_1", { cancel_at_period_end: true }), { id: "sub_old", status: "canceled", cancel_at_period_end: false, current_period_end: null }] });
  const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
  assert.ok(r.ok);
  assert.deepEqual(f.stripeWrites(), []);
});

test("preflight failures change nothing", async () => {
  for (const o of [{ failList: true }, { failBlockers: true }, { subs: [active("sub_1")], billingAvailable: false }]) {
    const f = fake(o);
    const r = await runAccountDeletion(f.deps, { confirmForfeit: true });
    assert.equal(r.ok, false);
    assert.deepEqual(f.stripeWrites(), []);
    assert.equal(f.state.deleted, false);
  }
});

test("missing-column detection used to tell whether migration 0003 is applied", () => {
  assert.equal(isMissingColumnError({ code: "42703", message: "column referral_codes.owner_deleted_at does not exist" }, "owner_deleted_at"), true);
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "Could not find the 'owner_deleted_at' column" }, "owner_deleted_at"), true);
  assert.equal(isMissingColumnError({ code: "57014", message: "canceling statement due to statement timeout" }, "owner_deleted_at"), false);
  assert.equal(isMissingColumnError(null, "owner_deleted_at"), false);
});
