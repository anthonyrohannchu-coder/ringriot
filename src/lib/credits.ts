import { supabaseAdmin } from "@/lib/supabase/server";

// All balance changes go through Postgres functions (see migrations) that lock
// the user's balance row, so concurrent requests can't double-spend.

export async function reserveCredits(userId: string, amount: number, idempotencyKey: string, reason: string) {
  const { data, error } = await supabaseAdmin().rpc("reserve_credits", {
    p_user: userId,
    p_amount: amount,
    p_key: idempotencyKey,
    p_reason: reason,
  });
  if (error) throw error;
  return data as { ok: boolean; transaction_id: string | null; balance: number; error: string | null };
}

export async function settleCredits(transactionId: string) {
  const { error } = await supabaseAdmin().rpc("settle_credits", { p_tx: transactionId });
  if (error) throw error;
}

export async function refundCredits(transactionId: string, reason: string) {
  const { error } = await supabaseAdmin().rpc("refund_credits", { p_tx: transactionId, p_reason: reason });
  if (error) throw error;
}

export async function grantCredits(userId: string, amount: number, idempotencyKey: string, reason: string) {
  const { error } = await supabaseAdmin().rpc("grant_credits", {
    p_user: userId,
    p_amount: amount,
    p_key: idempotencyKey,
    p_reason: reason,
  });
  if (error) throw error;
}

export async function logProviderUsage(row: {
  user_id: string | null;
  session_id?: string | null;
  provider: string;
  kind: "text" | "tts" | "call";
  units: number;
  cost_usd: number;
}) {
  await supabaseAdmin().from("provider_usage").insert(row);
}
