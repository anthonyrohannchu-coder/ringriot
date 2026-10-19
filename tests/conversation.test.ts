// Conversation-quality behaviors on live calls, exercised through the real callFlow.nextTurn.
// "Bad" fake models deliberately ignore the recipient, ramble, or deny being an AI, to prove the
// call logic itself enforces honesty, short goodbyes and stopping, not just the prompt.
import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { getCharacter } from "../src/lib/characters";
import { buildSystemPrompt } from "../src/lib/ai/prompt";
import { ScriptedProvider } from "../src/lib/ai/scripted";
import type { GenerateInput } from "../src/lib/ai/types";
import { admitsAI, detectIntent, nextTurn, openingTranscript, type CallRequest, type Generate } from "../src/lib/callFlow";

const call = (over: Partial<CallRequest> = {}): CallRequest => {
  const r: CallRequest = {
    id: "22222222-2222-2222-2222-222222222222", user_id: "u1", sender_name: "Anthony",
    character_id: "sal", scenario_id: "hit-my-car", transcript: [], turns: 0, ...over,
  };
  return { ...r, transcript: over.transcript ?? openingTranscript(r) };
};

/** Fake model that records exactly what it was sent and answers from a queue (or a function). */
function model(replies: (string | ((i: GenerateInput) => string))[]) {
  const inputs: GenerateInput[] = [];
  const generate: Generate = async (input) => {
    inputs.push(input);
    const next = replies.shift() ?? "Mm-hm?";
    const text = typeof next === "function" ? next(input) : next;
    return { text, provider: "fake", inputTokens: 1, outputTokens: 1, costUsd: 0 };
  };
  return { generate, inputs };
}
const words = (s: string) => s.trim().split(/\s+/).length;

// ---------- 1. right scenario, personality, history and latest reply on every turn ----------

test("every turn sends the selected scenario, the character, the full history and the latest reply (and the prompt reflects them)", async () => {
  const m = model(["Bernadette has a name, man. Did you even LOOK at her?", "A crumb?! ...Hold on, I'm checking."]);
  let r = call();
  let out = await nextTurn(r, "Who is Bernadette?", m.generate);
  r = { ...r, transcript: out.transcript, turns: out.turns };
  out = await nextTurn(r, "I think it's just a crumb, dude.", m.generate);

  const sal = getCharacter("sal")!;
  for (const [i, input] of m.inputs.entries()) {
    assert.equal(input.scenario.id, "hit-my-car");
    assert.equal(input.character.id, "sal");
    const prompt = buildSystemPrompt(input);
    assert.ok(prompt.includes(sal.style!), "character temperament");
    assert.ok(prompt.includes("Bernadette"), "scenario persona");
    assert.ok(!prompt.includes(sal.personality), "not the default pizza-guy backstory");
    const latest = input.history.at(-1)!;
    assert.equal(latest.role, "user");
    assert.ok(prompt.trimEnd().split("\n").at(-1)!.startsWith("RIGHT NOW:"), `turn ${i + 1}: latest-reply note is the last prompt line`);
    assert.ok(prompt.includes(latest.text.replace(/"/g, "'")), `turn ${i + 1}: prompt quotes their latest words`);
  }
  assert.deepEqual(m.inputs[1].history.map((t) => t.text), [
    "Who is Bernadette?",
    "Bernadette has a name, man. Did you even LOOK at her?",
    "I think it's just a crumb, dude.",
  ]);
});

// ---------- 2. respond to questions and unexpected replies ----------

test("a question is flagged to be answered directly before any prepared line", async () => {
  const m = model(["Bernadette's my car, man! A 2009 delivery hatchback. Why'd you graze her?"]);
  await nextTurn(call(), "Wait, who is Bernadette?", m.generate);
  const note = m.inputs[0].turnNote!;
  assert.match(note, /Answer that question directly/);
  assert.ok(note.includes("Wait, who is Bernadette?"));
});

test("an unexpected reply is flagged to be rolled with, quoting their exact words", async () => {
  const m = model(["A penguin. Driving. Okay, that explains the tiny scratch."]);
  await nextTurn(call(), "I'm actually a penguin", m.generate);
  assert.match(m.inputs[0].turnNote!, /React to exactly that first, roll with it even if it's unexpected/);
  assert.ok(m.inputs[0].turnNote!.includes("I'm actually a penguin"));
});

test("prepared beats are framed as optional and never to be used over a question", () => {
  const c = getCharacter("gary")!;
  const s = c.scenarios.find((x) => x.id === "bathroom-stall")!;
  const p = buildSystemPrompt({ character: c, scenario: s, history: [], channel: "phone" });
  assert.match(p, /if they asked something or said something unexpected, respond to THAT instead/);
  assert.match(p, /Never skip past what they said to deliver a prepared line/);
});

// ---------- 3. honest answer to "are you an AI?" ----------

test("AI-question detection: variants and non-questions", () => {
  for (const q of ["Are you an AI?", "are u a bot", "Is this a recording?", "Am I talking to a real person?", "wait are you even real",
    "Is this AI?", "you're a robot aren't you", "Are you a human?", "is this a prank?"]) {
    assert.equal(detectIntent(q), "ai_question", q);
  }
  assert.equal(detectIntent("I love AI movies"), "statement");
  assert.equal(detectIntent("Who is this?"), "question");
  assert.equal(detectIntent("Wait, what are you talking about?"), "question");
});

test("asked if it's AI and the model ignores the question: the call answers honestly instead", async () => {
  const m = model(["Bernadette has FEELINGS, man!"]); // ignores the question, like the transcripts showed
  const out = await nextTurn(call(), "Are you an AI?", m.generate);
  assert.ok(admitsAI(out.reply), out.reply);
  assert.match(out.reply, /AI comedy call Anthony set up/);
  assert.ok(!out.reply.includes("Bernadette"), "doesn't plough on with the bit");
  assert.equal(out.hangup, false, "they can choose to keep going");
  assert.match(m.inputs[0].turnNote!, /Answer honestly FIRST/);
});

test("asked if it's AI and the model DENIES it: replaced with the honest answer", async () => {
  const m = model(["AI? Me? I'm not an AI, I'm Sal! Real guy, real car."]);
  const out = await nextTurn(call(), "Are you a real person?", m.generate);
  assert.ok(admitsAI(out.reply) && !/not an AI/i.test(out.reply), out.reply);
});

test("asked if it's AI and the model answers honestly in character: its answer is kept", async () => {
  const honest = "Ha, yeah, I'm an AI character. Anthony set this up. But Bernadette's feelings are VERY real.";
  const m = model([honest]);
  const out = await nextTurn(call(), "is this AI?", m.generate);
  assert.equal(out.reply, honest);
});

test("no AI key (scripted provider): 'Are you an AI?' still gets an honest answer", async () => {
  const scripted = new ScriptedProvider();
  const out = await nextTurn(call(), "Are you an AI?", (i) => scripted.generate(i));
  assert.ok(admitsAI(out.reply), out.reply);
  assert.equal(out.hangup, false);
});

test("AI question on the last allowed turn: honest answer that also says goodbye, then hang up", async () => {
  const m = model(["Bernadette forgives you."]);
  const out = await nextTurn(call({ turns: 7 }), "are you a bot?", m.generate);
  assert.ok(admitsAI(out.reply) && /Bye!$/.test(out.reply), out.reply);
  assert.equal(out.hangup, true);
});

test("'Are you an AI? ok bye': honest AND ends", async () => {
  const m = model(["Haha alright, take care!"]);
  const out = await nextTurn(call(), "Are you an AI? ok bye", m.generate);
  assert.equal(out.hangup, true);
  assert.equal(out.reason, "recipient_left");
  assert.ok(admitsAI(out.reply), out.reply);
});

// ---------- 4. leaving: one short closing line, then end ----------

test("recipient is leaving and the model rambles on with the bit: one short closing line, then hang up", async () => {
  const ramble = "Wait wait wait, before you go, Bernadette wants to say something, she's been through a lot this week, the scratch, the crumb, the parking lot, and honestly I think we need to talk about the hubcaps too.";
  for (const line of ["Okay, I have to go now.", "bye", "gotta go, bye!", "I really need to go", "talk to you later"]) {
    const m = model([ramble]);
    const out = await nextTurn(call(), line, m.generate);
    assert.equal(out.hangup, true, line);
    assert.equal(out.reason, "recipient_left", line);
    assert.ok(words(out.reply) <= 22, `${line}: closing is short (${words(out.reply)} words)`);
    assert.match(out.reply, /\bbye\b/i);
    assert.equal(m.inputs[0].repliesLeft, 1);
    assert.match(m.inputs[0].turnNote!, /ONE short goodbye line/);
  }
});

test("recipient is leaving and the model gives a short in-character goodbye: kept, marker not spoken", async () => {
  const m = model(["Ha! Okay. Anthony set this up. Bernadette says bye! <end>"]);
  const out = await nextTurn(call(), "lol okay bye", m.generate);
  assert.equal(out.reply, "Ha! Okay. Anthony set this up. Bernadette says bye!");
  assert.equal(out.hangup, true);
});

test("'need to go' about something else is NOT treated as leaving", async () => {
  for (const line of ["I need to go to the store later, why?", "You have to go left at the light", "we need to go get gas"]) {
    assert.notEqual(detectIntent(line), "leaving", line);
    const out = await nextTurn(call(), line, model(["Gas! Bernadette loves gas."]).generate);
    assert.equal(out.hangup, false, line);
  }
});

// ---------- 5. stop: end immediately, no more joke ----------

test("asked to stop: ends immediately, AI never called, the joke doesn't continue", async () => {
  for (const line of ["stop", "Please stop calling me", "This isn't funny", "go away", "don't call me again", "I'm uncomfortable",
    "hang up", "leave me alone", "Are you an AI? Stop."]) {
    const m = model(["Bernadette needs an apology though!"]);
    const out = await nextTurn(call(), line, m.generate);
    assert.equal(out.reason, "asked_to_stop", line);
    assert.equal(out.hangup, true, line);
    assert.equal(m.inputs.length, 0, `${line}: no AI call`);
    assert.ok(!/Bernadette/.test(out.reply), `${line}: no more bit`);
    assert.match(out.reply, /joke from Anthony\. Goodbye\.$/);
  }
});

test("stop works mid-call, after several turns", async () => {
  const m = model(["Did you see her?", "Exactly!"]);
  let r = call();
  for (const line of ["what?", "um ok"]) {
    const o = await nextTurn(r, line, m.generate);
    r = { ...r, transcript: o.transcript, turns: o.turns };
  }
  const out = await nextTurn(r, "Okay seriously stop", m.generate);
  assert.equal(out.reason, "asked_to_stop");
  assert.equal(m.inputs.length, 2, "no third AI call");
});

test("'don't hang up' is not a stop request", () => {
  assert.notEqual(detectIntent("don't hang up, this is great"), "stop");
});
