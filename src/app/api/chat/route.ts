import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCharacter, getScenario } from "@/lib/characters";
import { getProvider } from "@/lib/ai";
import { DAILY_SESSION_CAP, MAX_TURNS_PER_SESSION, type PlanId } from "@/config/plans";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { logProviderUsage, refundCredits, reserveCredits, settleCredits } from "@/lib/credits";

const Body = z.object({
  sessionId: z.string().uuid().optional(),
  requestId: z.string().uuid(), // client-generated; makes "start session" idempotent
  characterId: z.string().max(40),
  scenarioId: z.string().max(60),
  spicy: z.boolean().optional(),
  history: z.array(z.object({ role: z.enum(["user", "character"]), text: z.string().max(600) })).max(30),
});

const tierRank = { free: 0, plus: 1, pro: 2 } as const;
const SESSION_COST = 1;

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const { sessionId, requestId, characterId, scenarioId, history, spicy } = parsed.data;

  const db = supabaseAdmin();
  const { data: profile } = await db.from("profiles").select("plan, suspended, save_transcripts").eq("id", user.id).single();
  if (!profile || profile.suspended) return NextResponse.json({ error: "account_unavailable" }, { status: 403 });
  const plan = profile.plan as PlanId;

  const character = getCharacter(characterId);
  if (!character) return NextResponse.json({ error: "unknown_character" }, { status: 404 });
  if (tierRank[character.tier] > tierRank[plan]) {
    return NextResponse.json({ error: "upgrade_required", message: `${character.name} needs the ${character.tier} plan.` }, { status: 402 });
  }
  const scenario = getScenario(character, scenarioId);

  let session: { id: string; turns: number; credit_tx_id: string | null; transcript: unknown[] };
  let newTx: string | null = null;

  if (sessionId) {
    const { data } = await db
      .from("conversation_sessions")
      .select("id, turns, credit_tx_id, transcript, status, user_id")
      .eq("id", sessionId)
      .single();
    if (!data || data.user_id !== user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (data.status !== "active" || data.turns >= MAX_TURNS_PER_SESSION) {
      return NextResponse.json({ error: "session_over", message: "That conversation hit its length limit. Start a new one (1 credit)." }, { status: 409 });
    }
    session = data;
  } else {
    // Daily cap (abuse + cost protection).
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db
      .from("conversation_sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_SESSION_CAP[plan]) {
      return NextResponse.json({ error: "daily_cap", message: "Daily limit reached. It resets in 24 hours." }, { status: 429 });
    }
    // Reserve before spending anything with the AI provider.
    const r = await reserveCredits(user.id, SESSION_COST, `session:${requestId}`, `conversation ${character.id}`);
    if (!r.ok) {
      return NextResponse.json({ error: "no_credits", message: "You're out of credits. Upgrade or buy a credit pack." }, { status: 402 });
    }
    newTx = r.transaction_id;
    const { data: existing } = await db.from("conversation_sessions").select("id, turns, credit_tx_id, transcript").eq("credit_tx_id", newTx).maybeSingle();
    if (existing) {
      session = existing; // duplicate request: reuse the session
      newTx = null;
    } else {
      const { data: created, error } = await db
        .from("conversation_sessions")
        .insert({ user_id: user.id, character_id: character.id, scenario_id: scenario.id, credit_tx_id: newTx })
        .select("id, turns, credit_tx_id, transcript")
        .single();
      if (error || !created) {
        if (newTx) await refundCredits(newTx, "session create failed");
        return NextResponse.json({ error: "server_error" }, { status: 500 });
      }
      session = created;
    }
  }

  try {
    const result = await getProvider().generate({ character, scenario, history, spicy: spicy === true });
    const turns = session.turns + 1;
    const transcript = profile.save_transcripts
      ? [...history, { role: "character", text: result.text }]
      : [];
    await db
      .from("conversation_sessions")
      .update({
        turns,
        transcript,
        status: turns >= MAX_TURNS_PER_SESSION ? "completed" : "active",
        ended_at: turns >= MAX_TURNS_PER_SESSION ? new Date().toISOString() : null,
      })
      .eq("id", session.id);
    if (newTx) await settleCredits(newTx);
    await logProviderUsage({
      user_id: user.id,
      session_id: session.id,
      provider: result.provider,
      kind: "text",
      units: result.inputTokens + result.outputTokens,
      cost_usd: result.costUsd,
    });
    return NextResponse.json({
      text: result.text,
      provider: result.provider,
      sessionId: session.id,
      turnsLeft: MAX_TURNS_PER_SESSION - turns,
    });
  } catch (err) {
    console.error("chat generate failed", err);
    // Refund rule: if the very first reply fails, the credit comes back.
    if (newTx) {
      await refundCredits(newTx, "first reply failed");
      await db.from("conversation_sessions").update({ status: "failed" }).eq("id", session.id);
    }
    return NextResponse.json({ error: "ai_unavailable", message: "The character dropped the call. Try again." }, { status: 503 });
  }
}
