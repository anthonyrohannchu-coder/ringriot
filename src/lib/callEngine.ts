import { brand } from "@/config/brand";
import { getCharacter, getScenario } from "@/lib/characters";
import { getProvider, type ChatTurn } from "@/lib/ai";
import { elevenlabsAvailable } from "@/lib/tts";
import { supabaseAdmin } from "@/lib/supabase/server";
import { logProviderUsage } from "@/lib/credits";
import { MAX_CALL_TURNS, sign, twiml, xml } from "@/lib/twilio";

type Req = {
  id: string; user_id: string; sender_name: string; character_id: string; scenario_id: string;
  transcript: ChatTurn[]; turns: number;
};

export async function loadRequest(id: string) {
  const { data } = await supabaseAdmin()
    .from("call_requests")
    .select("id, user_id, sender_name, character_id, scenario_id, transcript, turns, status")
    .eq("id", id)
    .maybeSingle();
  return data as (Req & { status: string }) | null;
}

/** Speak a line in the character's voice: ElevenLabs audio if available, otherwise a Polly voice. */
function speak(r: Req, turn: number, text: string) {
  const c = getCharacter(r.character_id)!;
  if (elevenlabsAvailable()) {
    const key = `${r.id}:${turn}`;
    return `<Play>${xml(`${brand.appUrl}/api/twilio/audio?req=${r.id}&t=${turn}&sig=${sign(key)}`)}</Play>`;
  }
  return `<Say voice="${xml(c.voice.polly)}">${xml(text.replace(/\*[^*]{1,30}\*/g, ""))}</Say>`;
}

function listen(r: Req) {
  const action = `${brand.appUrl}/api/twilio/turn?req=${r.id}&sig=${sign(r.id)}`;
  return `<Gather input="speech" action="${xml(action)}" method="POST" speechTimeout="auto" timeout="6" language="en-US" speechModel="phone_call" actionOnEmptyResult="true"></Gather>`;
}

async function save(r: Req, transcript: ChatTurn[], turns: number, extra: Record<string, unknown> = {}) {
  await supabaseAdmin().from("call_requests").update({ transcript, turns, ...extra }).eq("id", r.id);
}

/** Call answered: disclosure, then the character's opener, then listen. */
export async function answer(r: Req) {
  const c = getCharacter(r.character_id)!;
  const s = getScenario(c, r.scenario_id);
  const transcript: ChatTurn[] = [{ role: "character", text: s.opener }];
  await save(r, transcript, 0, { status: "in_progress" });
  const disclosure = `Heads up: this is an A.I. comedy call from ${brand.name}, sent by ${r.sender_name}. It's being recorded. Hang up anytime.`;
  return twiml(
    `<Say voice="Polly.Joanna-Neural">${xml(disclosure)}</Say><Pause length="1"/>` +
      speak({ ...r, transcript }, 0, s.opener) +
      listen(r),
  );
}

/** Friend said something: reply in character, or wrap up. */
export async function turn(r: Req, heard: string) {
  const c = getCharacter(r.character_id)!;
  const s = getScenario(c, r.scenario_id);
  const transcript: ChatTurn[] = [...(r.transcript ?? [])];
  const said = heard.trim().slice(0, 500);
  transcript.push({ role: "user", text: said || "(silence)" });
  const turns = r.turns + 1;

  // Friend asked to stop: drop the bit.
  if (/\b(stop|hang up|leave me alone|who is this really|not funny)\b/i.test(said)) {
    const bye = "Okay, okay. I'll let you go. It was just a joke from your friend. Have a good one!";
    transcript.push({ role: "character", text: bye });
    await save(r, transcript, turns);
    return twiml(speak({ ...r, transcript }, transcript.length - 1, bye) + "<Hangup/>");
  }

  let reply: string;
  try {
    const history = transcript.slice(1).map((t) => (t.text === "(silence)" ? { ...t, text: "(they said nothing)" } : t));
    const result = await getProvider().generate({ character: c, scenario: s, history, userName: undefined });
    reply = result.text;
    await logProviderUsage({ user_id: r.user_id, provider: result.provider, kind: "call", units: result.inputTokens + result.outputTokens, cost_usd: result.costUsd });
  } catch {
    reply = "Hello? You're breaking up. Hello?";
  }
  const last = turns >= MAX_CALL_TURNS;
  if (last) reply += ` Anyway, I gotta go. ${r.sender_name} says hi. Bye!`;
  transcript.push({ role: "character", text: reply });
  await save(r, transcript, turns);
  return twiml(speak({ ...r, transcript }, transcript.length - 1, reply) + (last ? "<Hangup/>" : listen(r)));
}
