// Live-call conversation tests: scenario selection -> prompt -> turns -> ending, with a fake AI.
import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCharacter } from "../src/lib/characters";
import { buildSystemPrompt } from "../src/lib/ai/prompt";
import { ScriptedProvider } from "../src/lib/ai/scripted";
import type { GenerateInput, GenerateResult } from "../src/lib/ai/types";
import {
  answerTwiml, disclosureText, nextTurn, openingTranscript, parseModelReply, trailingSilences, turnTwiml,
  type CallRequest, type Generate,
} from "../src/lib/callFlow";

const base = (over: Partial<CallRequest> = {}): CallRequest => ({
  id: "11111111-1111-1111-1111-111111111111",
  user_id: "u1",
  sender_name: "Anthony",
  character_id: "sal",
  scenario_id: "hit-my-car",
  transcript: [],
  turns: 0,
  ...over,
});

/** Fake model: records every input; replies from a queue. */
function fakeModel(replies: string[]) {
  const inputs: GenerateInput[] = [];
  const generate: Generate = async (input) => {
    inputs.push(structuredClone({ ...input, character: { id: input.character.id } as never }) as GenerateInput);
    inputs[inputs.length - 1].character = input.character; // keep the real object for prompt checks
    const text = replies.shift() ?? "Mm-hm. Go on?";
    return { text, provider: "fake", inputTokens: 10, outputTokens: 5, costUsd: 0 } satisfies GenerateResult;
  };
  return { generate, inputs };
}

async function bodyOf(res: Response) {
  return await res.text();
}

test("answering: disclosure first, then the selected scenario's opener, then it listens", async () => {
  const r = base();
  const transcript = openingTranscript(r);
  assert.equal(transcript[0].text, getCharacter("sal")!.scenarios.find((s) => s.id === "hit-my-car")!.opener);
  const xml = await bodyOf(answerTwiml(r, transcript));
  const iDisclosure = xml.indexOf("A.I. comedy call");
  const iOpener = xml.indexOf("You hit my car!");
  const iGather = xml.indexOf("<Gather");
  assert.ok(iDisclosure >= 0 && iDisclosure < iOpener && iOpener < iGather, "disclosure -> opener -> listen");
  assert.ok(xml.includes("sent by Anthony") && xml.includes("being recorded"));
  assert.match(xml, /<Gather input="speech" action="https:\/\/ringriot\.example\/api\/twilio\/turn\?req=11111111-1111-1111-1111-111111111111&amp;sig=[^"]+"/);
  assert.ok(xml.includes('voice="Polly.Matthew-Neural"'), "Sal's phone voice");
});

test("the selected scenario reaches the model on every turn, with the recipient's words and growing context", async () => {
  const m = fakeModel(["Bernadette has FEELINGS, man. Did you even look at her?", "A crumb? Hold on, I'm checking."]);
  let r = base({ transcript: openingTranscript(base()) });

  let out = await nextTurn(r, "What? I didn't hit anything.", m.generate);
  assert.equal(out.hangup, false);
  r = { ...r, transcript: out.transcript, turns: out.turns };
  out = await nextTurn(r, "Maybe it's just a crumb.", m.generate);

  assert.equal(m.inputs.length, 2);
  for (const input of m.inputs) {
    assert.equal(input.scenario.id, "hit-my-car");
    assert.equal(input.character.id, "sal");
    assert.equal(input.channel, "phone");
    assert.equal(input.senderName, "Anthony");
    assert.ok(!input.spicy);
  }
  // Context: turn 2 sees turn 1's exchange plus the new line.
  assert.deepEqual(m.inputs[1].history.map((t) => t.text), [
    "What? I didn't hit anything.",
    "Bernadette has FEELINGS, man. Did you even look at her?",
    "Maybe it's just a crumb.",
  ]);
  assert.equal(m.inputs[0].repliesLeft, 8);
  assert.equal(m.inputs[1].repliesLeft, 7);
  const xml = await bodyOf(turnTwiml(r, out));
  assert.ok(xml.includes("checking.") && xml.includes("<Gather"), "speaks the reply, then listens again");
});

test("system prompt for every requested scenario uses its persona, not the character's default backstory", () => {
  const wanted: Record<string, [string, string]> = {
    "Why Are You Calling My Boyfriend?": ["brenda", "Kevin"],
    "Why Are You Snapchatting My Girl?": ["chad", "Kayla"],
    "You Hit My Car!": ["sal", "Bernadette"],
    "Secret Crush": ["jordan", "Sam"],
    "Mexican Food Order": ["brenda", "taqueria"],
    "Found Your Number in a Bathroom Stall": ["gary", "duck"],
    "Your Dog Pooped in My Yard": ["earl", "petunias"],
    "Why Did You Call My Girlfriend?": ["dez", "Tasha"],
    "Stay Away From My Girl": ["sal", "Gina"],
    "Your Car Is Blocking Mine": ["gary", "recycling bin"],
    "Chinese Food Order": ["earl", "Golden Garden"],
  };
  for (const [title, [charId, marker]] of Object.entries(wanted)) {
    const c = getCharacter(charId)!;
    const s = c.scenarios.find((x) => x.title === title);
    assert.ok(s, `${title} exists on ${charId}`);
    assert.ok(s!.persona && s!.ending && s!.beats?.length && s!.fallbackLines?.length, `${title} is complete`);
    const prompt = buildSystemPrompt({ character: c, scenario: s!, history: [], channel: "phone", senderName: "Anthony", repliesLeft: 8 });
    assert.ok(prompt.includes(marker), `${title} prompt mentions ${marker}`);
    assert.ok(!prompt.includes(c.personality), `${title} prompt doesn't carry ${c.name}'s default backstory`);
    assert.ok(prompt.includes("Live phone call rules") && prompt.includes("speech-to-text"));
    assert.ok(prompt.includes("never intimidate, never threaten"));
    assert.ok(prompt.includes("No accents, imitated languages or cultural stereotypes"));
    assert.ok(prompt.includes("Never ask for money, passwords, addresses"));
    assert.ok(prompt.includes("Keep it PG-13"), "phone calls are never spicy");
  }
});

test("phone calls ignore spicy mode even if requested", () => {
  const c = getCharacter("chad")!;
  const s = c.scenarios.find((x) => x.id === "snapchatting-my-girl")!;
  const prompt = buildSystemPrompt({ character: c, scenario: s, history: [], spicy: true, channel: "phone" });
  assert.ok(!prompt.includes("SPICY MODE") && prompt.includes("Keep it PG-13"));
});

test("last turn: model is told it's the last line, and the call hangs up after it", async () => {
  const m = fakeModel(["Bernadette forgives you. Anthony set this up, by the way. Bye!"]);
  const r = base({ transcript: openingTranscript(base()), turns: 7 });
  const out = await nextTurn(r, "Sorry, Bernadette.", m.generate);
  assert.equal(m.inputs[0].repliesLeft, 1);
  const prompt = buildSystemPrompt({ ...m.inputs[0] });
  assert.ok(prompt.includes("THIS IS YOUR LAST LINE"));
  assert.equal(out.hangup, true);
  assert.equal(out.reason, "turn_limit");
  const xml = await bodyOf(turnTwiml(r, out));
  assert.ok(xml.endsWith("<Hangup/></Response>") && !xml.includes("<Gather"));
});

test("last turn without a goodbye gets one appended", async () => {
  const m = fakeModel(["Bernadette forgives you."]);
  const out = await nextTurn(base({ transcript: openingTranscript(base()), turns: 7 }), "ok", m.generate);
  assert.match(out.reply, /Anthony says hi\. Bye!$/);
});

test("model can end the call early with <end>; the marker is never spoken", async () => {
  const m = fakeModel(["Okay, okay, we share Gina. Anthony set this up. Bye! <end>"]);
  const r = base({ scenario_id: "stay-away-from-my-girl", transcript: openingTranscript(base({ scenario_id: "stay-away-from-my-girl" })) });
  const out = await nextTurn(r, "Fine, half each.", m.generate);
  assert.equal(out.hangup, true);
  assert.equal(out.reason, "model_ended");
  assert.ok(!out.reply.includes("<end>"));
  const xml = await bodyOf(turnTwiml(r, out));
  assert.ok(!xml.includes("end&gt;") && xml.includes("<Hangup/>"));
});

test("recipient says stop: friendly exit, no AI call", async () => {
  const m = fakeModel([]);
  const out = await nextTurn(base({ transcript: openingTranscript(base()) }), "please stop calling me", m.generate);
  assert.equal(m.inputs.length, 0);
  assert.equal(out.hangup, true);
  assert.equal(out.reason, "asked_to_stop");
  assert.match(out.reply, /joke from Anthony/);
});

test("silence: first time the model prods them, second time in a row the call ends", async () => {
  const m = fakeModel(["Hello? You still there? Bernadette's waiting."]);
  let r = base({ transcript: openingTranscript(base()) });
  let out = await nextTurn(r, "", m.generate);
  assert.equal(out.hangup, false);
  assert.equal(m.inputs[0].history.at(-1)!.text, "(they said nothing)");
  r = { ...r, transcript: out.transcript, turns: out.turns };
  out = await nextTurn(r, "   ", m.generate);
  assert.equal(out.hangup, true);
  assert.equal(out.reason, "silence");
  assert.equal(m.inputs.length, 1, "no AI call for the hang-up line");
  assert.equal(trailingSilences(out.transcript), 2);
});

test("AI error or timeout: the call continues with an in-character line instead of dying", async () => {
  const failing: Generate = async () => { throw new Error("timeout"); };
  const out = await nextTurn(base({ transcript: openingTranscript(base()) }), "hello?", failing);
  assert.equal(out.hangup, false);
  assert.match(out.reply, /breaking up/);
  assert.equal(out.usage, null);
});

test("no AI key: scripted lines still match the selected scenario", async () => {
  const scripted = new ScriptedProvider();
  const r = base({ character_id: "earl", scenario_id: "chinese-food-order", transcript: openingTranscript(base({ character_id: "earl", scenario_id: "chinese-food-order" })) });
  const out = await nextTurn(r, "Hello, what can I get you?", (i) => scripted.generate(i));
  assert.equal(out.reply, getCharacter("earl")!.scenarios.find((s) => s.id === "chinese-food-order")!.fallbackLines![0]);
});

test("speech and names are XML-escaped in TwiML", async () => {
  const m = fakeModel([`<Say>injected</Say> & "quotes"`]);
  const r = base({ sender_name: "Jo & Al", transcript: openingTranscript(base()) });
  const out = await nextTurn(r, "<Hangup/>", m.generate);
  const xml = await bodyOf(turnTwiml(r, out));
  assert.ok(!xml.includes("<Say>injected</Say>") && xml.includes("&lt;Say&gt;injected"));
  assert.ok(disclosureText("Jo & Al").includes("Jo & Al"));
  assert.ok((await bodyOf(answerTwiml(r, openingTranscript(r)))).includes("Jo &amp; Al"));
});

test("parseModelReply strips the end marker anywhere and in any case", () => {
  assert.deepEqual(parseModelReply("Bye! <end>"), { text: "Bye!", end: true });
  assert.deepEqual(parseModelReply("Bye <END> now"), { text: "Bye now", end: true });
  assert.deepEqual(parseModelReply("Still going"), { text: "Still going", end: false });
});

test("no AI key: a scripted call ends on the scenario's goodbye line", async () => {
  const scripted = new ScriptedProvider();
  let r = base({ transcript: openingTranscript(base()) });
  let out;
  for (let i = 0; i < 8; i++) {
    out = await nextTurn(r, `line ${i}`, (input) => scripted.generate(input));
    if (out.hangup) break;
    r = { ...r, transcript: out.transcript, turns: out.turns };
  }
  assert.equal(out!.reason, "model_ended");
  assert.equal(out!.turns, 5);
  assert.equal(out!.reply, "Bernadette forgives you. Drive safe. Bye!");
});
