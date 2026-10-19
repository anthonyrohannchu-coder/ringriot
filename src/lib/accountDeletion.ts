// Account deletion as an ordered, failure-aware sequence. No framework or SDK imports: the API route
// supplies the real Stripe/Supabase operations, tests supply fakes.
//
// Order (nothing irreversible happens until the account is actually gone):
//  1. Read-only preflight: read subscriptions, check for anything that would make deletion fail or
//     destroy records (blockers), and require confirmation if a paid period is still running.
//  2. Reversible billing step: good-standing subscriptions are set to not renew (cancel_at_period_end).
//  3. Delete the user. If that fails, step 2 is rolled back (renewal turned back on), so the account is
//     left exactly as it was. If the rollback itself fails, it's written to admin_audit_log.
//  4. Only after the account is deleted, irreversible cancellations (subscriptions with failed payments,
//     so Stripe stops retrying the card). A failure here is written to admin_audit_log for follow-up.

import { deletionActionFor, isTerminal } from "./billing";

export type DeletionSub = {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
};

export type DeletionDeps = {
  billingAvailable: boolean;
  listSubscriptions(): Promise<DeletionSub[]>;
  /** Reasons deletion can't proceed safely right now (empty = OK). Must not change anything. */
  findBlockers(): Promise<string[]>;
  setCancelAtPeriodEnd(subscriptionId: string, value: boolean): Promise<void>;
  cancelNow(subscriptionId: string): Promise<void>;
  /** Deletes the user and everything that cascades from it. Throws on failure. */
  deleteUser(): Promise<void>;
  audit(action: string, detail: Record<string, unknown>): Promise<void>;
  log?(message: string, err?: unknown): void;
};

export type DeletionResult =
  | { ok: true; warnings: string[] }
  | { ok: false; status: number; error: string; message?: string; paidThrough?: string; blockers?: string[] };

export async function runAccountDeletion(deps: DeletionDeps, opts: { confirmForfeit: boolean }): Promise<DeletionResult> {
  const log = deps.log ?? (() => {});

  // ---------- 1. Preflight (read-only) ----------
  let subs: DeletionSub[];
  try {
    subs = await deps.listSubscriptions();
  } catch (err) {
    log("delete account: couldn't read subscriptions", err);
    return { ok: false, status: 502, error: "billing_unavailable", message: "We couldn't check your subscription, so nothing was deleted. Try again in a moment." };
  }
  const live = subs.filter((s) => !isTerminal(s.status));
  if (live.length && !deps.billingAvailable) {
    return { ok: false, status: 503, error: "billing_unavailable", message: "Billing is offline, so nothing was deleted. Email support to close your account." };
  }

  let blockers: string[];
  try {
    blockers = await deps.findBlockers();
  } catch (err) {
    log("delete account: blocker check failed", err);
    return { ok: false, status: 502, error: "check_failed", message: "We couldn't finish the safety checks, so nothing was deleted. Try again in a moment." };
  }
  if (blockers.length) {
    return {
      ok: false, status: 409, error: "deletion_blocked", blockers,
      message: "Your account has referral history we need to keep. Nothing was changed. Email support and we'll close your account for you.",
    };
  }

  const paidThrough = live
    .filter((s) => s.status === "active" || s.status === "trialing")
    .map((s) => s.current_period_end)
    .filter((d): d is string => !!d)
    .sort()
    .pop();
  if (paidThrough && !opts.confirmForfeit) {
    return { ok: false, status: 409, error: "active_subscription", paidThrough };
  }

  // ---------- 2. Reversible: stop renewals ----------
  const stopped: string[] = [];
  const rollback = async () => {
    const failed: string[] = [];
    for (const id of stopped) {
      try {
        await deps.setCancelAtPeriodEnd(id, false);
      } catch (err) {
        log(`delete account: couldn't restore renewal for ${id}`, err);
        failed.push(id);
      }
    }
    return failed;
  };

  for (const s of live) {
    if (deletionActionFor(s.status, s.cancel_at_period_end) !== "cancel_at_period_end") continue;
    try {
      await deps.setCancelAtPeriodEnd(s.id, true);
      stopped.push(s.id);
    } catch (err) {
      log(`delete account: couldn't stop renewal for ${s.id}`, err);
      const failed = await rollback();
      if (failed.length) await safeAudit(deps, "account_deletion_rollback_failed", { stage: "stop_renewal", subscriptions: failed }, log);
      return {
        ok: false, status: 502, error: "billing_update_failed",
        message: failed.length
          ? "We couldn't stop your subscription, and couldn't fully undo the change. Your account was not deleted. Check renewal in Manage billing or email support."
          : "We couldn't stop your subscription, so nothing was changed and your account was not deleted. Try again or email support.",
      };
    }
  }

  // ---------- 3. Delete the account ----------
  try {
    await deps.deleteUser();
  } catch (err) {
    log("delete account: user deletion failed", err);
    const failed = await rollback();
    if (failed.length) await safeAudit(deps, "account_deletion_rollback_failed", { stage: "delete_user", subscriptions: failed }, log);
    return {
      ok: false, status: 500, error: "delete_failed",
      message: failed.length
        ? "We couldn't delete your account, and your plan may be set not to renew. Turn renewal back on in Manage billing or email support."
        : "We couldn't delete your account. Nothing was changed. Try again or email support.",
    };
  }

  // ---------- 4. Irreversible: cancel subscriptions with failed payments ----------
  const warnings: string[] = [];
  for (const s of live) {
    if (deletionActionFor(s.status, s.cancel_at_period_end) !== "cancel_now") continue;
    try {
      await deps.cancelNow(s.id);
    } catch (err) {
      log(`delete account: couldn't cancel ${s.id} after deletion`, err);
      warnings.push(s.id);
      await safeAudit(deps, "stripe_cancel_pending", { subscription: s.id, status: s.status }, log);
    }
  }
  return { ok: true, warnings };
}

async function safeAudit(deps: DeletionDeps, action: string, detail: Record<string, unknown>, log: (m: string, e?: unknown) => void) {
  try {
    await deps.audit(action, detail);
  } catch (err) {
    log(`delete account: audit write failed (${action}) ${JSON.stringify(detail)}`, err);
  }
}

/** PostgREST/Postgres "column does not exist" (used to detect whether migration 0003 is applied). */
export function isMissingColumnError(err: { code?: string; message?: string } | null | undefined, column: string) {
  if (!err) return false;
  if (err.code === "42703" || err.code === "PGRST204") return true;
  return !!err.message && err.message.includes(column) && /does not exist|could not find/i.test(err.message);
}
