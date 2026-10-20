import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { friendNumberProblem, formatAsTyped, formatNumber, normalizeNumber } from "../src/lib/phone";
import { creditsUsed, firstBlockingStep, stepProblem, trackProgress, type WizardState } from "../src/lib/callSteps";
import { previewText, previewUrl, voicePicker, voiceScore, voiceSettingsFor, type ElevenVoice } from "../src/lib/previewVoices";

const ok: WizardState = {
  prankUsable: true, friendNumber: "(415) 555-2671", callerNumber: "+12084438421", callerNumbers: ["+12084438421"],
  senderName: "Anthony", consent: true, credits: 10, cost: 3,
};

test("friend number validation matches the server's rules", () => {
  assert.equal(normalizeNumber("(415) 555-2671"), "+14155552671");
  assert.equal(normalizeNumber("1 415 555 2671"), "+14155552671");
  assert.equal(friendNumberProblem("(415) 555-2671"), null);
  assert.match(friendNumberProblem("")!, /Enter/);
  assert.match(friendNumberProblem("415555")!, /too short/);
  assert.match(friendNumberProblem("+44 7700 900123")!, /US and Canadian/);
  assert.match(friendNumberProblem("800-555-1234")!, /Toll-free/);
  assert.ok(friendNumberProblem("911-555-1234"));
  assert.equal(formatAsTyped("4155552671"), "(415) 555-2671");
  assert.equal(formatNumber("+12084438421"), "(208) 443-8421");
});

test("server and client share one normalizeNumber", async () => {
  const twilio = await import("../src/lib/twilio");
  assert.equal(twilio.normalizeNumber, normalizeNumber);
});

test("wizard blocks each step until it's valid", () => {
  assert.equal(firstBlockingStep(ok), null);
  assert.equal(firstBlockingStep({ ...ok, prankUsable: false }), "prank");
  assert.equal(firstBlockingStep({ ...ok, friendNumber: "123" }), "friend");
  assert.equal(firstBlockingStep({ ...ok, callerNumber: "+15555550100" }), "caller", "a number that isn't configured is rejected");
  assert.equal(firstBlockingStep({ ...ok, callerNumbers: [] , callerNumber: ""}), "caller");
  assert.equal(firstBlockingStep({ ...ok, senderName: " " }), "details");
  assert.equal(firstBlockingStep({ ...ok, senderName: "<script>" }), "details");
  assert.equal(firstBlockingStep({ ...ok, consent: false }), "details");
  assert.equal(firstBlockingStep({ ...ok, credits: 2 }), "review");
  assert.match(stepProblem("review", { ...ok, credits: 2 })!, /need 3 credits/);
});

test("tracker maps every status and only charges answered calls", () => {
  assert.equal(trackProgress("awaiting_consent").reached, 0);
  assert.equal(trackProgress("calling").reached, 2);
  assert.equal(trackProgress("in_progress").reached, 3);
  assert.equal(trackProgress("completed").reached, 4);
  for (const s of ["declined", "expired", "blocked", "no_answer", "failed"]) assert.ok(trackProgress(s).stoppedAt, s);
  assert.equal(creditsUsed("completed", 3), 3);
  for (const s of ["declined", "expired", "no_answer", "failed", "blocked", "awaiting_consent"]) assert.equal(creditsUsed(s, 3), 0, s);
});

test("preview text, URL and voice choice", () => {
  assert.equal(previewText("Hey *sniffs* it's   me."), "Hey it's me.");
  assert.equal(previewUrl("https://x.supabase.co/", "sal-hit-my-car"), "https://x.supabase.co/storage/v1/object/public/previews/sal-hit-my-car.mp3");
  assert.equal(previewUrl(undefined, "a"), null);
  const voices: ElevenVoice[] = [
    { voice_id: "m1", name: "Adam", labels: { gender: "male", age: "middle aged", accent: "american" } },
    { voice_id: "m2", name: "Bill", labels: { gender: "male", age: "old", accent: "american" } },
    { voice_id: "m3", name: "Cal", labels: { gender: "male", age: "middle aged", accent: "american" } },
    { voice_id: "f1", name: "Dee", labels: { gender: "female", age: "young", accent: "american" } },
    { voice_id: "f2", name: "Eve", labels: { gender: "female", age: "young", accent: "british" } },
  ];
  assert.equal(voiceScore(voices[3], { gender: "m", age: "young", delivery: "" }), -1, "never a mismatched gender");
  const pick = voicePicker(voices);
  assert.equal(pick({ gender: "m", age: "old", delivery: "" })!.voice_id, "m2");
  assert.equal(pick({ gender: "f", age: "young", delivery: "" })!.voice_id, "f1", "American accent preferred");
  const a = pick({ gender: "m", age: "adult", delivery: "" })!.voice_id;
  const b = pick({ gender: "m", age: "adult", delivery: "" })!.voice_id;
  assert.notEqual(a, b, "rotates between equally good voices");
  assert.ok(voiceSettingsFor({ gender: "m", age: "adult", delivery: "panicking" }).stability < voiceSettingsFor({ gender: "m", age: "adult", delivery: "deadpan" }).stability);
});

test("consent replies and wording", async () => {
  const { parseReply, consentText, inviteSmsHref, STANDING_KINDS } = await import("../src/lib/consent");
  assert.deepEqual(parseReply("yes"), { kind: "yes", code: null });
  assert.deepEqual(parseReply("  Yes AB12CD34!"), { kind: "yes", code: "ab12cd34" });
  assert.deepEqual(parseReply("yeah lol"), { kind: "yes", code: null });
  assert.equal(parseReply("STOP").kind, "stop");
  assert.equal(parseReply("no thanks").kind, "stop");
  assert.equal(parseReply("who is this").kind, "other");
  const t = consentText({ senderName: "Anthony", characterName: "Sal", archetype: "Lost Pizza Guy", brand: "RingRiot" });
  assert.match(t, /AI comedy character/);
  assert.match(t, /recorded/);
  assert.match(t, /future pranks from Anthony will then ring you directly/, "the YES must say it covers future pranks");
  assert.match(t, /STOP/);
  assert.equal(inviteSmsHref("+12084438421", "ab12cd34"), "sms:+12084438421?&body=YES%20AB12CD34");
  assert.ok(!(STANDING_KINDS as readonly string[]).includes("recipient_sms_yes"), "old one-off YES rows don't count as standing consent");
});
