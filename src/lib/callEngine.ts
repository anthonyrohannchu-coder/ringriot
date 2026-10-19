// Database side of a live call: load/save the call_requests row and record AI usage.
// The conversation rules themselves live in callFlow.ts.
import { getProvider } from "@/lib/ai";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderUsage } from "@/lib/credits";
import { answerTwiml, nextTurn, openingTranscript, turnTwiml, type CallRequest } from "@/lib/callFlow";

export async function loadRequest(id: string) {
  const { data } = await supabaseAdmin()
    .from("call_requests")
    .select("id, user_id, sender_name, character_id, scenario_id, transcript, turns, status")
    .eq("id", id)
    .maybeSingle();
  return data as (CallRequest & { status: string }) | null;
}

async function save(r: CallRequest, transcript: CallRequest["transcript"], turns: number, extra: Record<string, unknown> = {}) {
  await supabaseAdmin().from("call_requests").update({ transcript, turns, ...extra }).eq("id", r.id);
}

/** Call answered: disclosure, then the scenario's opener, then listen. */
export async function answer(r: CallRequest) {
  const transcript = openingTranscript(r);
  await save(r, transcript, 0, { status: "in_progress" });
  return answerTwiml(r, transcript);
}

/** The recipient said something: reply in character with full context, or wrap up. */
export async function turn(r: CallRequest, heard: string) {
  const outcome = await nextTurn(r, heard, (input, signal) => getProvider().generate(input, signal));
  if (outcome.usage) {
    const u = outcome.usage;
    await logProviderUsage({ user_id: r.user_id, provider: u.provider, kind: "call", units: u.inputTokens + u.outputTokens, cost_usd: u.costUsd }).catch(() => {});
  }
  await save(r, outcome.transcript, outcome.turns);
  return turnTwiml(r, outcome);
}
