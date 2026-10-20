import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { findScenario, getCharacter } from "@/lib/characters";
import { brand } from "@/config/brand";
import { STANDING_KINDS, consentText } from "@/lib/consent";
import { refundCredits, reserveCredits } from "@/lib/credits";
import {
  CALL_CREDIT_COST, RECIPIENT_REQUESTS_PER_DAY, USER_REQUESTS_PER_DAY,
  configuredCallerNumbers, ensureNumberWebhook, hashNumber, isAllowedCallerNumber, normalizeNumber, sendSms, startCall, twilioConfigured, withinQuietHours,
} from "@/lib/twilio";

const Body = z.object({
  senderName: z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} .'\-]+$/u, "Use letters, numbers and spaces only"),
  phone: z.string().min(7).max(25),
  characterId: z.string().max(40),
  scenarioId: z.string().max(60),
  callerNumber: z.string().optional(),
  /** The sender's promise that the friend agreed (Terms of Service). Required for every call. */
  senderAttests: z.literal(true, { errorMap: () => ({ message: "Confirm your friend agreed to get prank calls from you." }) }),
});

const tierRank = { free: 0, plus: 1, pro: 2 } as const;

// Request a real call: texts the friend first. Nothing rings until they reply YES.
export async function POST(req: NextRequest) {
  if (!twilioConfigured()) return NextResponse.json({ error: "calls_not_configured", message: "Real calls aren't switched on yet." }, { status: 501 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized", message: "Log in to send a call." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request", message: parsed.error.issues[0]?.message ?? "Check the form." }, { status: 400 });
  const { senderName, characterId, scenarioId } = parsed.data;
  // Prank Caller Number: must be one of RingRiot's own provisioned numbers. Never trust the client's choice.
  const numbers = configuredCallerNumbers();
  const callerNumber = parsed.data.callerNumber || (numbers.length === 1 ? numbers[0] : "");
  if (!callerNumber || !isAllowedCallerNumber(callerNumber)) {
    return NextResponse.json({ error: "bad_caller_number", message: "Choose one of the configured caller numbers." }, { status: 400 });
  }

  const to = normalizeNumber(parsed.data.phone);
  if (!to) return NextResponse.json({ error: "bad_number", message: "Enter a US or Canadian mobile number (no toll-free or emergency numbers)." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("plan, suspended").eq("id", user.id).single();
  if (!profile || profile.suspended) return NextResponse.json({ error: "account_unavailable" }, { status: 403 });
  if (profile.plan === "free") return NextResponse.json({ error: "upgrade_required", message: "Real calls are on Plus and Pro." }, { status: 402 });

  const character = getCharacter(characterId);
  if (!character) return NextResponse.json({ error: "unknown_character" }, { status: 404 });
  if (tierRank[character.tier] > tierRank[profile.plan as "plus" | "pro"]) {
    return NextResponse.json({ error: "upgrade_required", message: `${character.name} needs the ${character.tier} plan.` }, { status: 402 });
  }
  // Exact match: the scenario chosen in the UI is the one the live call plays (no silent fallback).
  const scenario = findScenario(character, scenarioId);
  if (!scenario) return NextResponse.json({ error: "unknown_scenario", message: "Pick one of this character's bits." }, { status: 400 });

  const { data: bal } = await db.from("credit_balances").select("balance").eq("user_id", user.id).single();
  if ((bal?.balance ?? 0) < CALL_CREDIT_COST) {
    return NextResponse.json({ error: "no_credits", message: `A real call needs ${CALL_CREDIT_COST} credits.` }, { status: 402 });
  }

  if (!withinQuietHours()) {
    // Rule: 8am-9pm in BOTH Eastern and Pacific time, i.e. 11am-9pm ET / 8am-6pm PT. Say that exactly.
    return NextResponse.json({ error: "quiet_hours", message: "Calls can only be sent 8am–6pm Pacific (11am–9pm Eastern). Try again then." }, { status: 429 });
  }

  const toHash = hashNumber(to);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: blocked }, { count: mine }, { count: theirs }, { data: pending }, { data: standing }] = await Promise.all([
    db.from("blocked_numbers").select("to_hash").eq("to_hash", toHash).maybeSingle(),
    db.from("call_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since),
    db.from("call_requests").select("id", { count: "exact", head: true }).eq("to_hash", toHash).gte("created_at", since),
    db.from("call_requests").select("id").eq("to_hash", toHash).eq("status", "awaiting_consent").gt("expires_at", new Date().toISOString()).limit(1),
    // Has this friend already said YES to this sender's pranks (by text or invite link)?
    db.from("consent_records").select("id").eq("user_id", user.id).eq("recipient_hash", toHash).in("kind", [...STANDING_KINDS]).limit(1),
  ]);
  if (blocked) return NextResponse.json({ error: "blocked", message: "That number has opted out of RingRiot calls." }, { status: 403 });
  if ((mine ?? 0) >= USER_REQUESTS_PER_DAY) return NextResponse.json({ error: "daily_cap", message: "You've hit today's limit for real calls." }, { status: 429 });
  if ((theirs ?? 0) >= RECIPIENT_REQUESTS_PER_DAY) return NextResponse.json({ error: "recipient_cap", message: "That number has gotten enough calls today. Give them a break." }, { status: 429 });
  if (pending?.length) return NextResponse.json({ error: "pending", message: "That friend already has a call waiting for their YES." }, { status: 409 });

  const { data: request, error } = await db
    .from("call_requests")
    .insert({ user_id: user.id, sender_name: senderName, to_e164: to, from_e164: callerNumber, to_hash: toHash, character_id: character.id, scenario_id: scenario.id })
    .select("id")
    .single();
  if (error || !request) return NextResponse.json({ error: "server_error" }, { status: 500 });
  // Keep the sender's promise on record next to the call (hashed number only).
  await db.from("consent_records").insert({ user_id: user.id, kind: "sender_attestation", recipient_hash: toHash });

  // Friend already opted in to this sender's pranks: ring right away, no text.
  if (standing?.length) {
    const r = await reserveCredits(user.id, CALL_CREDIT_COST, `call:${request.id}`, "real phone call");
    if (!r.ok) {
      await db.from("call_requests").update({ status: "failed", to_e164: null }).eq("id", request.id);
      return NextResponse.json({ error: "no_credits", message: `A real call needs ${CALL_CREDIT_COST} credits.` }, { status: 402 });
    }
    try {
      await ensureNumberWebhook(callerNumber);
      const call = await startCall(to, request.id, callerNumber);
      await db.from("call_requests").update({ status: "calling", consented_at: new Date().toISOString(), credit_tx_id: r.transaction_id, twilio_call_sid: call.sid }).eq("id", request.id);
      return NextResponse.json({ ok: true, id: request.id, direct: true });
    } catch (err) {
      console.error("direct call failed", err);
      if (r.transaction_id) await refundCredits(r.transaction_id, "call failed to start");
      await db.from("call_requests").update({ status: "failed", to_e164: null }).eq("id", request.id);
      return NextResponse.json({ error: "call_failed", message: "Couldn't start the call. No credits were used." }, { status: 502 });
    }
  }

  try {
    await ensureNumberWebhook(callerNumber);
    await sendSms(to, consentText({ senderName, characterName: character.name, archetype: character.archetype, brand: brand.name }), callerNumber);
  } catch (err) {
    console.error("sms failed", err);
    await db.from("call_requests").update({ status: "failed", to_e164: null }).eq("id", request.id);
    return NextResponse.json({ error: "sms_failed", message: "Couldn't text that number. Check it and try again." }, { status: 502 });
  }

  return NextResponse.json({ ok: true, id: request.id });
}

// List my recent real calls.
export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabaseAdmin()
    .from("call_requests")
    .select("id, sender_name, character_id, scenario_id, status, turns, recording_sid, created_at, ended_at, expires_at, to_e164")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const calls = (data ?? []).map((c) => ({
    ...c,
    to: c.to_e164 ? `•••-•••-${c.to_e164.slice(-4)}` : null,
    to_e164: undefined,
    status: c.status === "awaiting_consent" && new Date(c.expires_at) < new Date() ? "expired" : c.status,
    hasRecording: !!c.recording_sid,
    recording_sid: undefined,
  }));
  const [{ data: bal }, { data: ref }] = await Promise.all([
    supabaseAdmin().from("credit_balances").select("balance").eq("user_id", user.id).single(),
    supabaseAdmin().from("referral_codes").select("code").eq("user_id", user.id).maybeSingle(),
  ]);
  return NextResponse.json({
    calls, callerNumbers: configuredCallerNumbers(), credits: bal?.balance ?? null, cost: CALL_CREDIT_COST,
    inviteUrl: ref?.code ? `${brand.appUrl}/invite/${ref.code}` : null,
  });
}
