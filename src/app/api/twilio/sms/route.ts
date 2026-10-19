import { supabaseAdmin } from "@/lib/supabase/server";
import { reserveCredits } from "@/lib/credits";
import { brand } from "@/config/brand";
import { CALL_CREDIT_COST, hashNumber, normalizeNumber, readTwilioForm, startCall, twiml, xml } from "@/lib/twilio";

// Replies from friends: YES places the call, STOP/NO blocks the number forever.
export async function POST(req: Request) {
  const { params, ok } = await readTwilioForm(req);
  if (!ok) return new Response("forbidden", { status: 403 });

  const from = normalizeNumber(params.From ?? "");
  const body = (params.Body ?? "").trim().toUpperCase();
  if (!from) return twiml("");
  const toHash = hashNumber(from);
  const db = supabaseAdmin();

  if (/^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|NO|BLOCK)\b/.test(body)) {
    await db.from("blocked_numbers").upsert({ to_hash: toHash });
    await db.from("call_requests").update({ status: "declined", to_e164: null }).eq("to_hash", toHash).eq("status", "awaiting_consent");
    // Twilio sends its own STOP confirmation; reply only for NO/BLOCK.
    return twiml(/^(NO|BLOCK)/.test(body) ? `<Message>Got it. You won't get ${xml(brand.name)} calls or texts again.</Message>` : "");
  }

  if (!/^(YES|Y|YEA|YEAH|YEP|OK|OKAY|SURE)\b/.test(body)) {
    return twiml(`<Message>Reply YES to get your prank call, or STOP to block ${xml(brand.name)}.</Message>`);
  }

  const { data: request } = await db
    .from("call_requests")
    .select("id, user_id, to_e164, from_e164, expires_at")
    .eq("to_hash", toHash)
    .eq("status", "awaiting_consent")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!request || !request.to_e164 || new Date(request.expires_at) < new Date()) {
    return twiml("<Message>That prank call expired. Ask your friend to send a new one!</Message>");
  }

  // Consent on record before anything rings.
  await db.from("consent_records").insert({ user_id: request.user_id, kind: "recipient_sms_yes", recipient_hash: toHash });

  const r = await reserveCredits(request.user_id, CALL_CREDIT_COST, `call:${request.id}`, "real phone call");
  if (!r.ok) {
    await db.from("call_requests").update({ status: "failed", to_e164: null }).eq("id", request.id);
    return twiml("<Message>Sorry, your friend ran out of credits. Tell them to top up!</Message>");
  }

  try {
    // Older rows may have no from_e164 (null): fall back to the first configured number.
    const call = await startCall(request.to_e164, request.id, request.from_e164 ?? undefined);
    await db.from("call_requests").update({ status: "calling", consented_at: new Date().toISOString(), credit_tx_id: r.transaction_id, twilio_call_sid: call.sid }).eq("id", request.id);
    return twiml("<Message>Calling you now. Pick up! 📞</Message>");
  } catch (err) {
    console.error("call start failed", err);
    const { refundCredits } = await import("@/lib/credits");
    if (r.transaction_id) await refundCredits(r.transaction_id, "call failed to start");
    await db.from("call_requests").update({ status: "failed", to_e164: null }).eq("id", request.id);
    return twiml("<Message>Something broke on our end. No credits were used.</Message>");
  }
}
