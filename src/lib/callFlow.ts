// Live phone-call conversation logic, independent of the database and Twilio transport so it can be
// unit-tested. callEngine.ts loads/saves the call row and calls these functions from the Twilio webhooks.
import { brand } from "@/config/brand";
import { getCharacter, getScenario, type Character, type Scenario } from "@/lib/characters";
import { END_TOKEN } from "@/lib/ai/prompt";
import type { ChatTurn, GenerateInput, GenerateResult } from "@/lib/ai/types";
import { elevenlabsAvailable } from "@/lib/tts";
import { MAX_CALL_TURNS, sign, twiml, xml } from "@/lib/twilio";

export type CallRequest = {
  id: string;
  user_id: string;
  sender_name: string;
  character_id: string;
  scenario_id: string;
  transcript: ChatTurn[];
  turns: number;
};

export type Generate = (input: GenerateInput, signal?: AbortSignal) => Promise<GenerateResult>;

export type TurnOutcome = {
  transcript: ChatTurn[];
  turns: number;
  reply: string;
  hangup: boolean;
  reason: "continue" | "asked_to_stop" | "silence" | "model_ended" | "turn_limit";
  usage: GenerateResult | null;
};

/** Twilio's webhook timeout is 15s; leave room for TTS and network. */
export const AI_TIMEOUT_MS = 8_000;
const SILENCE = "(silence)";
const STOP = /\b(stop|hang up|leave me alone|who is this really|not funny)\b/i;
const GOODBYE = /\b(bye|goodbye|take care|see ya|later)\b/i;

export function callContext(r: CallRequest): { character: Character; scenario: Scenario } {
  const character = getCharacter(r.character_id);
  if (!character) throw new Error(`unknown character ${r.character_id}`);
  return { character, scenario: getScenario(character, r.scenario_id) };
}

/** Removes the end marker the model uses to finish the call, wherever it appears. */
export function parseModelReply(text: string): { text: string; end: boolean } {
  const end = text.toLowerCase().includes(END_TOKEN);
  const clean = text.split(/<end>/i).join(" ").replace(/\s+/g, " ").trim();
  return { text: clean, end };
}

export function trailingSilences(transcript: ChatTurn[]) {
  let n = 0;
  for (let i = transcript.length - 1; i >= 0; i--) {
    const t = transcript[i];
    if (t.role === "character") continue;
    if (t.text !== SILENCE) break;
    n++;
  }
  return n;
}

/** Call answered: the opener (after the disclosure, which answerTwiml adds). */
export function openingTranscript(r: CallRequest): ChatTurn[] {
  return [{ role: "character", text: callContext(r).scenario.opener }];
}

/**
 * One exchange: the recipient said `heard`; decide the character's reply and whether to hang up.
 * The whole transcript so far is sent to the model every turn, so it keeps context.
 */
export async function nextTurn(r: CallRequest, heard: string, generate: Generate, maxTurns = MAX_CALL_TURNS): Promise<TurnOutcome> {
  const { character, scenario } = callContext(r);
  const transcript: ChatTurn[] = [...(r.transcript ?? [])];
  const said = heard.trim().slice(0, 500);
  transcript.push({ role: "user", text: said || SILENCE });
  const turns = r.turns + 1;
  const sender = r.sender_name;

  const finish = (reply: string, reason: TurnOutcome["reason"], usage: GenerateResult | null = null): TurnOutcome => {
    transcript.push({ role: "character", text: reply });
    return { transcript, turns, reply, hangup: reason !== "continue", reason, usage };
  };

  // Safeguard first: the recipient asked to stop. No AI call, friendly exit.
  if (STOP.test(said)) {
    return finish(`Okay, okay. I'll let you go. It was just a joke from ${sender}. Have a good one!`, "asked_to_stop");
  }
  // Two silent turns in a row: they've walked away or the line is dead.
  if (!said && trailingSilences(transcript) >= 2) {
    return finish(`Hello? ...I think I lost you. ${sender} says hi. Bye!`, "silence");
  }

  const repliesLeft = Math.max(1, maxTurns - r.turns);
  const last = repliesLeft <= 1;
  const history = transcript.slice(1).map((t) => (t.text === SILENCE ? { ...t, text: "(they said nothing)" } : t));

  let usage: GenerateResult | null = null;
  let reply: string;
  let modelEnded = false;
  try {
    usage = await generate(
      { character, scenario, history, channel: "phone", senderName: sender, repliesLeft },
      AbortSignal.timeout(AI_TIMEOUT_MS),
    );
    const parsed = parseModelReply(usage.text);
    reply = parsed.text || "Sorry, you cut out. Say that again?";
    modelEnded = parsed.end;
  } catch {
    reply = "Hello? You're breaking up. Say that again?";
  }

  if (modelEnded) return finish(reply, "model_ended", usage);
  if (last) {
    // The model was told this is the last line; make sure it actually lands and says goodbye.
    if (!GOODBYE.test(reply)) reply += ` Anyway, I gotta go. ${sender} says hi. Bye!`;
    return finish(reply, "turn_limit", usage);
  }
  return finish(reply, "continue", usage);
}

// ---------- TwiML ----------

/** Speak a line in the character's voice: ElevenLabs audio if available, otherwise a Polly voice. */
export function speakTwiml(r: CallRequest, lineIndex: number, text: string) {
  const { character } = callContext(r);
  if (elevenlabsAvailable()) {
    const key = `${r.id}:${lineIndex}`;
    return `<Play>${xml(`${brand.appUrl}/api/twilio/audio?req=${r.id}&t=${lineIndex}&sig=${sign(key)}`)}</Play>`;
  }
  return `<Say voice="${xml(character.voice.polly)}">${xml(text.replace(/\*[^*]{1,30}\*/g, ""))}</Say>`;
}

/** Wait for the recipient to speak; Twilio posts the transcription to /api/twilio/turn. */
export function listenTwiml(r: CallRequest) {
  const action = `${brand.appUrl}/api/twilio/turn?req=${r.id}&sig=${sign(r.id)}`;
  return `<Gather input="speech" action="${xml(action)}" method="POST" speechTimeout="auto" timeout="6" language="en-US" speechModel="phone_call" actionOnEmptyResult="true"></Gather>`;
}

export function disclosureText(senderName: string) {
  return `Heads up: this is an A.I. comedy call from ${brand.name}, sent by ${senderName}. It's being recorded. Hang up anytime.`;
}

/** First response when the call connects: disclosure, the scenario opener, then listen. */
export function answerTwiml(r: CallRequest, transcript: ChatTurn[]) {
  return twiml(
    `<Say voice="Polly.Joanna-Neural">${xml(disclosureText(r.sender_name))}</Say><Pause length="1"/>` +
      speakTwiml({ ...r, transcript }, 0, transcript[0].text) +
      listenTwiml(r),
  );
}

export function turnTwiml(r: CallRequest, outcome: TurnOutcome) {
  const line = outcome.transcript.length - 1;
  return twiml(speakTwiml({ ...r, transcript: outcome.transcript }, line, outcome.reply) + (outcome.hangup ? "<Hangup/>" : listenTwiml(r)));
}
