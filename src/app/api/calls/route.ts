import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { getCharacter, getScenario } from "@/lib/characters";
import { brand } from "@/config/brand";
import {
  CALL_CREDIT_COST, RECIPIENT_REQUESTS_PER_DAY, USER_REQUESTS_PER_DAY,
  ensureNumberWebhook, hashNumber, normalizeNumber, sendSms, twilioConfigured, withinQuietHours,
} from "@/lib/twilio";

const Body = z.object({
  senderName: z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} .'\-]+$/u, "Use letters, numbers and spaces only"),
  phone: z.string().min(7).max(25),
  characterId: z.string().max(40),
  scenarioId: z.string().max(60),
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
  const scenario = getScenario(character, scenarioId);

  const { data: bal } = await db.from("credit_balances").select("balance").eq("user_id", user.id).single();
  if ((bal?.balance ?? 0) < CALL_CREDIT_COST) {
    return NextResponse.json({ error: "no_credits", message: `A real call needs ${CALL_CREDIT_COST} credits.` }, { status: 402 });
  }

  if (!withinQuietHours()) {
    return NextResponse.json({ error: "quiet_hours", message: "Calls can only be sent between 8am and 9pm. Try again later." }, { status: 429 });
  }

  const toHash = hashNumber(to);
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const [{ data: blocked }, { count: mine }, { count: theirs }, { data: pending }] = await Promise.all([
    db.from("blocked_numbers").select("to_hash").eq("to_hash", toHash).maybeSingle(),
    db.from("call_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since),
    db.from("call_requests").select("id", { count: "exact", head: true }).eq("to_hash", toHash).gte("created_at", since),
    db.from("call_requests").select("id").eq("to_hash", toHash).eq("status", "awaiting_consent").gt("expires_at", new Date().toISOString()).limit(1),
  ]);
  if (blocked) return NextResponse.json({ error: "blocked", message: "That number has opted out of RingRiot calls." }, { status: 403 });
  if ((mine ?? 0) >= USER_REQUESTS_PER_DAY) return NextResponse.json({ error: "daily_cap", message: "You've hit today's limit for real calls." }, { status: 429 });
  if ((theirs ?? 0) >= RECIPIENT_REQUESTS_PER_DAY) return NextResponse.json({ error: "recipient_cap", message: "That number has gotten enough calls today. Give them a break." }, { status: 429 });
  if (pending?.length) return NextResponse.json({ error: "pending", message: "That friend already has a call waiting for their YES." }, { status: 409 });

  const { data: request, error } = await db
    .from("call_requests")
    .insert({ user_id: user.id, sender_name: senderName, to_e164: to, to_hash: toHash, character_id: character.id, scenario_id: scenario.id })
    .select("id")
    .single();
  if (error || !request) return NextResponse.json({ error: "server_error" }, { status: 500 });

  try {
    await ensureNumberWebhook();
    await sendSms(
      to,
      `${senderName} sent you a prank call from ${character.name} (${character.archetype}), an AI comedy character on ${brand.name}. ` +
        `The call is recorded and may be shared by ${senderName}. Reply YES to get it now. Reply STOP to never get ${brand.name} texts or calls.`,
    );
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
    .select("id, sender_name, character_id, status, turns, recording_sid, created_at, ended_at, expires_at, to_e164")
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
  return NextResponse.json({ calls });
}
