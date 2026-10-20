// Credit-pack refunds: take back unspent credits from a refunded pack. Dependencies are injected so the whole
// flow (duplicates, partial refunds, spent credits) is unit-tested against a fake ledger.
import { packClawbackDelta, packClawbackKey, packClawbackPrefix } from "@/lib/billing";

export type RefundCharge = { id: string; amount: number; amount_refunded: number; invoice?: string | null; payment_intent: string | null };
export type PackSession = { id: string; userId: string | null; product: string | null };
export type RefundDeps = {
  packCredits: number;
  findSession: (paymentIntentId: string) => Promise<PackSession | null>;
  balance: (userId: string) => Promise<number>;
  /** Credits already taken back for this checkout session (sum over keys starting with the prefix). */
  clawedSoFar: (userId: string, keyPrefix: string) => Promise<number>;
  reserve: (userId: string, amount: number, key: string) => Promise<{ ok: boolean; transaction_id: string | null }>;
  settle: (transactionId: string) => Promise<void>;
};

export type RefundOutcome = { action: "ignored"; reason: string } | { action: "clawed_back"; credits: number; key: string } | { action: "nothing_to_take"; key: string };

export async function handlePackRefund(ch: RefundCharge, d: RefundDeps): Promise<RefundOutcome> {
  if (ch.invoice) return { action: "ignored", reason: "subscription invoice (cancel in the billing portal)" };
  if (!ch.payment_intent) return { action: "ignored", reason: "no payment intent" };
  const cs = await d.findSession(ch.payment_intent);
  if (!cs || !cs.userId) return { action: "ignored", reason: "no RingRiot checkout session" };
  if (cs.product !== "credits_25") return { action: "ignored", reason: `not a credit pack (${cs.product ?? "unknown"})` };

  const key = packClawbackKey(cs.id, ch.amount_refunded);
  const [balance, already] = await Promise.all([d.balance(cs.userId), d.clawedSoFar(cs.userId, packClawbackPrefix(cs.id))]);
  const n = packClawbackDelta({ packCredits: d.packCredits, amountPaidCents: ch.amount, amountRefundedCents: ch.amount_refunded, alreadyClawed: already, balance });
  if (n <= 0) return { action: "nothing_to_take", key };
  const r = await d.reserve(cs.userId, n, key);
  if (r.ok && r.transaction_id) await d.settle(r.transaction_id);
  return { action: "clawed_back", credits: n, key };
}
