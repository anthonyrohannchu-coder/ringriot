// Live phone-call conversation logic, independent of the database and Twilio transport so it can be
// unit-tested. callEngine.ts loads/saves the call row and calls these functions from the Twilio webhooks.
import { brand } from "@/config/brand";
import { getCharacter, getScenario, type Character, type Scenario } from "@/lib/characters";
import { END_TOKEN } from "@/lib/ai/prompt";
import { describeAIError, type AIErrorInfo } from "@/lib/ai/errors";
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
  reason: "continue" | "asked_to_stop" | "silence" | "model_ended" | "turn_limit" | "recipient_left";
  usage: GenerateResult | null;
  /**
   * Where the reply came from: "ai" = a genuine provider response; "scripted" = the no-key line bank;
   * "fallback" = the AI call FAILED and a canned line was used (see aiError); "safeguard" = a rule
   * (stop / silence) answered without calling the AI.
   */
  source: "ai" | "scripted" | "fallback" | "safeguard";
  /** Why the AI call failed (secret-free), when source is "fallback". */
  aiError: AIErrorInfo | null;
};

/** Twilio's webhook timeout is 15s; leave room for TTS and network. */
export const AI_TIMEOUT_MS = 8_000;
const SILENCE = "(silence)";
const GOODBYE = /\b(bye|goodbye|take care|see ya|later)\b/i;

// ---------- What did the recipient just do? ----------
// Checked in this order; the first match wins. Stop always beats everything else.

/** Asked to stop / uncomfortable: end immediately, no AI call, no more joke. */
const STOP =
  /\b(stop|(?<!don'?t )hang up|leave me alone|who is this really|not funny|isn'?t funny|go away|don'?t call|do not call|quit calling|unsubscribe|i'?m (?:not comfortable|uncomfortable|scared)|you'?re scaring me)\b/i;
/** Wrapping up: at most one short closing line, then hang up. "I need to go to the store" is not leaving. */
const LEAVING =
  /\b(bye|goodbye|bye-bye|gotta go(?! to)|i'?m hanging up|talk (?:to you )?later|ttyl)\b|\b(?:i|we)\b[^.?!]{0,20}\b(?:have|got|need) to go\b(?!\s+(?:to|get|buy|pick|see|do|and)\b)/i;
/** "Are you an AI / a bot / a real person?" and similar. */
const AI_QUESTION =
  /\b(?:are|r)\s+(?:you|u)\s+(?:an?\s+|even\s+|actually\s+|like\s+)*(?:ai|a\.i\.?|bot|robot|computer|machine|recording|real|human|a real person|a person|automated)\b|\bis\s+(?:this|that)\s+(?:an?\s+)?(?:ai|a\.i\.?|bot|robot|recording|computer|real|automated|a real person|a prank)\b|\bam\s+i\s+(?:talking|speaking)\s+(?:to|with)\s+(?:an?\s+)?(?:ai|bot|robot|computer|machine|real person|human|person)\b|\b(?:you'?re|you are)\s+(?:an?\s+)?(?:ai|bot|robot)\b/i;
/** A reply that honestly admits being an AI (and doesn't deny it). */
const AI_ADMISSION = /\b(AI|A\.I\.|artificial intelligence)\b/i;
const AI_DENIAL = /\b(?:not|n'?t|never)\s+(?:an?\s+|really\s+|even\s+)?(?:ai|a\.i\.|bot|robot|computer)\b/i;

export type RecipientIntent = "stop" | "silence" | "leaving" | "ai_question" | "question" | "statement";

export function detectIntent(said: string): RecipientIntent {
  const s = said.trim();
  if (!s) return "silence";
  if (STOP.test(s)) return "stop";
  if (AI_QUESTION.test(s)) return "ai_question";
  if (LEAVING.test(s)) return "leaving";
  if (/\?\s*$/.test(s) || /^(who|what|why|how|where|when|is|are|do|does|did|can|could|would|will|wait,? what)\b/i.test(s)) return "question";
  return "statement";
}

export function admitsAI(reply: string) {
  return AI_ADMISSION.test(reply) && !AI_DENIAL.test(reply);
}

/** The per-turn instruction, placed last in the system prompt. Quotes their exact words. */
export function turnNoteFor(intent: RecipientIntent, said: string, sender: string): string {
  const q = said.replace(/"/g, "'").slice(0, 200);
  switch (intent) {
    case "ai_question":
      return `They asked "${q}". Answer honestly FIRST, in plain words: yes, you're an AI character and this is an AI comedy call ${sender} set up. Never claim to be human. After that you can keep it light, or offer to let them go.`;
    case "leaving":
      return `They said "${q}": they're leaving. Reply with ONE short goodbye line (under 15 words), mention ${sender} set this up, and end with ${END_TOKEN}. Do not continue the bit.`;
    case "question":
      return `They asked "${q}". Answer that question directly, in character, before anything else. Don't skip past it to a prepared line.`;
    case "silence":
      return `They said nothing. Prod them in character ("hello? you still there?").`;
    default:
      return `They just said "${q}". React to exactly that first, roll with it even if it's unexpected, then nudge the bit along.`;
  }
}

/** Keep a goodbye to one short line; if the model ran long, use a short in-character fallback. */
export function shortClosing(reply: string, sender: string) {
  const words = reply.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 22) return `Okay, okay, I'll let you go. ${sender} set this up. Bye!`;
  return GOODBYE.test(reply) ? reply : `${reply} Bye!`;
}

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

  let attempted = false;
  let aiError: AIErrorInfo | null = null;
  const finish = (reply: string, reason: TurnOutcome["reason"], usage: GenerateResult | null = null): TurnOutcome => {
    transcript.push({ role: "character", text: reply });
    const source: TurnOutcome["source"] = !attempted ? "safeguard" : aiError ? "fallback" : usage?.provider === "scripted" ? "scripted" : "ai";
    return { transcript, turns, reply, hangup: reason !== "continue", reason, usage, source, aiError };
  };

  const intent = detectIntent(said);

  // Safeguard first: the recipient asked to stop. End now: no AI call, out of character, no more joke.
  if (intent === "stop") {
    return finish(`Okay, sorry about that. It was just a joke from ${sender}. Goodbye.`, "asked_to_stop");
  }
  // Two silent turns in a row: they've walked away or the line is dead.
  if (intent === "silence" && trailingSilences(transcript) >= 2) {
    return finish(`Hello? ...I think I lost you. ${sender} says hi. Bye!`, "silence");
  }

  // "Are you an AI? ...bye" is both: answer honestly AND end.
  const leaving = intent === "leaving" || (intent === "ai_question" && LEAVING.test(said));
  const repliesLeft = leaving ? 1 : Math.max(1, maxTurns - r.turns);
  const last = repliesLeft <= 1;
  const history = transcript.slice(1).map((t) => (t.text === SILENCE ? { ...t, text: "(they said nothing)" } : t));
  const turnNote = turnNoteFor(intent, said, sender);

  let usage: GenerateResult | null = null;
  let reply: string;
  let modelEnded = false;
  attempted = true;
  try {
    usage = await generate(
      { character, scenario, history, channel: "phone", senderName: sender, repliesLeft, turnNote },
      AbortSignal.timeout(AI_TIMEOUT_MS),
    );
    const parsed = parseModelReply(usage.text);
    reply = parsed.text || "Sorry, you cut out. Say that again?";
    modelEnded = parsed.end;
  } catch (err) {
    // Keep the call alive with an in-character line, but record WHY (never the key) so it's visible.
    aiError = describeAIError(err, process.env.ANTHROPIC_MODEL || "claude-haiku-5-5");
    usage = null;
    reply = "Hello? You're breaking up. Say that again?";
  }

  // Leaving: at most one short closing line, then hang up, whatever the model did.
  if (leaving) {
    let closing = shortClosing(reply, sender);
    if (intent === "ai_question" && !admitsAI(closing)) closing = `Yep, it's an AI comedy call from ${sender}. Bye!`;
    return finish(closing, "recipient_left", usage);
  }

  // Asked if this is AI: the answer must be honest. If the model dodged or denied it (or there's no
  // AI and the scripted line ignored the question), answer plainly instead of continuing the bit.
  if (intent === "ai_question" && !admitsAI(reply)) {
    reply = last
      ? `Honest answer? Yeah, I'm an AI character. This was an AI comedy call ${sender} set up for you. Bye!`
      : `Honest answer? Yeah, I'm an AI character. This is an AI comedy call ${sender} set up for you. Want me to keep going, or should I let you go?`;
    modelEnded = false;
  }

  if (modelEnded) return finish(reply, "model_ended", usage);
  if (last) {
    // The model was told this is the last line; make sure it actually lands and says goodbye.
    if (!GOODBYE.test(reply)) reply += ` Anyway, I gotta go. ${sender} says hi. Bye!`;
    return finish(reply, leaving ? "recipient_left" : "turn_limit", usage);
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
