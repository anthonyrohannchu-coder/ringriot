// Root cause + misleading PASS:
//  1. A failed AI call used to be swallowed (bare catch) and turned into a canned line with no record
//     of why. Now every turn says where its reply came from and keeps a secret-free error.
//  2. call:check used to exit 0 even when every AI turn fell back. Now a real-AI run FAILS on any fallback.
import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeAIError, formatAIError, redactSecrets } from "../src/lib/ai/errors";
import { nextTurn, openingTranscript, type CallRequest, type Generate, type TurnOutcome } from "../src/lib/callFlow";
import { evaluateRun, type TurnRecord } from "../src/lib/callCheck";
import { ScriptedProvider } from "../src/lib/ai/scripted";

const FAKE_KEY = "sk-ant-api03-THISISAFAKEKEYFORTESTS-1234567890abcdefXYZ";
const call = (): CallRequest => {
  const r: CallRequest = { id: "33333333-3333-3333-3333-333333333333", user_id: "u", sender_name: "Anthony", character_id: "sal", scenario_id: "hit-my-car", transcript: [], turns: 0 };
  return { ...r, transcript: openingTranscript(r) };
};
/** Error shaped like the Anthropic SDK's APIError (status + parsed body). */
const apiError = (status: number, type: string, message: string, name = "APIError") =>
  Object.assign(new Error(`${status} ${JSON.stringify({ type: "error", error: { type, message } })}`), { name, status, error: { type: "error", error: { type, message } } });

// ---------- error classification (secret-free) ----------

test("classifies the provider errors that make every turn fall back, with a fix hint", () => {
  const cases: [unknown, string][] = [
    // Exactly what api.anthropic.com returned to an unauthenticated request from this environment:
    [apiError(401, "authentication_error", "x-api-key header is required", "AuthenticationError"), "auth"],
    [apiError(401, "authentication_error", "invalid x-api-key", "AuthenticationError"), "auth"],
    [apiError(403, "permission_error", "Your API key does not have permission to use the specified resource.", "PermissionDeniedError"), "permission"],
    [apiError(404, "not_found_error", "model: claude-haiku-5-5", "NotFoundError"), "model"],
    [apiError(400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API.", "BadRequestError"), "billing"],
    [apiError(400, "invalid_request_error", "messages: roles must alternate", "BadRequestError"), "bad_request"],
    [apiError(429, "rate_limit_error", "rate limited", "RateLimitError"), "rate_limit"],
    [apiError(529, "overloaded_error", "Overloaded"), "overloaded"],
    [Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" }), "timeout"],
    [Object.assign(new Error("Connection error."), { name: "APIConnectionError", cause: { code: "ENOTFOUND" } }), "network"],
  ];
  for (const [err, kind] of cases) {
    const i = describeAIError(err, "claude-haiku-5-5");
    assert.equal(i.kind, kind, formatAIError(i));
    assert.ok(i.hint.length > 10);
  }
  assert.equal(describeAIError(cases[0][0]).status, 401);
  assert.equal(describeAIError(cases[0][0]).type, "authentication_error");
});

test("API keys never survive into error text", () => {
  const leaky = apiError(401, "authentication_error", `invalid x-api-key: ${FAKE_KEY}`);
  const i = describeAIError(Object.assign(leaky, { message: `${leaky.message} headers {"x-api-key":"${FAKE_KEY}"}` }));
  assert.ok(!JSON.stringify(i).includes(FAKE_KEY));
  assert.ok(!redactSecrets(`Authorization: Bearer ${FAKE_KEY}`).includes(FAKE_KEY));
  assert.match(redactSecrets(`key ${FAKE_KEY}`), /sk-ant-\[REDACTED\]/);
});

// ---------- the swallowed error is now recorded ----------

test("a failing AI call is recorded as a fallback WITH the reason (it used to be thrown away)", async () => {
  const failing: Generate = async () => { throw apiError(401, "authentication_error", `invalid x-api-key ${FAKE_KEY}`, "AuthenticationError"); };
  const out = await nextTurn(call(), "Wait, who is Bernadette?", failing);
  assert.equal(out.source, "fallback");
  assert.equal(out.usage, null);
  assert.equal(out.aiError?.kind, "auth");
  assert.equal(out.aiError?.status, 401);
  assert.equal(out.hangup, false, "the call itself still survives a provider hiccup");
  assert.ok(!JSON.stringify(out).includes(FAKE_KEY), "no key in the outcome");
});

test("reply sources: genuine AI, scripted, safeguard", async () => {
  const ok: Generate = async () => ({ text: "Bernadette's my car, man!", provider: "anthropic", inputTokens: 5, outputTokens: 5, costUsd: 0 });
  const ai = await nextTurn(call(), "who?", ok);
  assert.equal(ai.source, "ai");
  assert.equal(ai.aiError, null);
  const scripted = new ScriptedProvider();
  assert.equal((await nextTurn(call(), "who?", (i) => scripted.generate(i))).source, "scripted");
  const never: Generate = async () => { throw new Error("must not be called"); };
  const stop = await nextTurn(call(), "stop", never);
  assert.equal(stop.source, "safeguard");
  assert.equal(stop.aiError, null);
});

// ---------- the misleading PASS ----------

function recordsFrom(outcomes: TurnOutcome[], line = "Wait, who is Bernadette?"): TurnRecord[] {
  return outcomes.map((o, i) => ({ label: `call ${i}`, line, outcome: o, ms: 300 }));
}

test("REGRESSION: real-AI mode where every AI turn falls back must FAIL (it used to report PASS)", async () => {
  const failing: Generate = async () => { throw apiError(404, "not_found_error", "model: claude-haiku-5-5", "NotFoundError"); };
  const outcomes: TurnOutcome[] = [];
  for (let i = 0; i < 20; i++) outcomes.push(await nextTurn(call(), "Wait, who is Bernadette?", failing));
  const res = evaluateRun({ providerName: "anthropic", keyPresent: true, turns: recordsFrom(outcomes), expectationFailures: [] });
  assert.equal(res.mode, "real-ai");
  assert.equal(res.exitCode, 1);
  assert.equal(res.counts.fallback, 20);
  assert.equal(res.counts.ai, 0);
  assert.ok(res.failures.some((f) => f.includes("AI request failed 20x") && f.includes("model 404 not_found_error")), res.failures.join("\n"));
  assert.ok(res.failures.some((f) => f.includes("No genuine AI response")));
});

test("real-AI mode: even ONE fallback fails the run", async () => {
  const ok: Generate = async () => ({ text: "Bernadette's my car!", provider: "anthropic", inputTokens: 1, outputTokens: 1, costUsd: 0 });
  const bad: Generate = async () => { throw Object.assign(new Error("Request was aborted."), { name: "APIUserAbortError" }); };
  const outcomes = [await nextTurn(call(), "who?", ok), await nextTurn(call(), "who?", ok), await nextTurn(call(), "who?", bad)];
  const res = evaluateRun({ providerName: "anthropic", keyPresent: true, turns: recordsFrom(outcomes, "who?"), expectationFailures: [] });
  assert.equal(res.exitCode, 1);
  assert.ok(res.failures[0].startsWith("AI request failed 1x") && res.failures[0].includes("timeout"));
});

test("real-AI mode with only genuine responses passes; style issues are warnings, not failures", async () => {
  const long = "word ".repeat(50).trim();
  const ok: Generate = async () => ({ text: long, provider: "anthropic", inputTokens: 1, outputTokens: 1, costUsd: 0 });
  const res = evaluateRun({ providerName: "anthropic", keyPresent: true, turns: recordsFrom([await nextTurn(call(), "who?", ok)], "who?"), expectationFailures: [] });
  assert.equal(res.exitCode, 0);
  assert.equal(res.warnings.length, 1);
});

test("key set but scripted provider ran: FAIL (not a real AI test)", async () => {
  const scripted = new ScriptedProvider();
  const res = evaluateRun({ providerName: "scripted", keyPresent: true, turns: recordsFrom([await nextTurn(call(), "who?", (i) => scripted.generate(i))], "who?"), expectationFailures: [] });
  assert.equal(res.exitCode, 1);
  assert.match(res.failures[0], /Not a real AI test/);
});

test("no key, scripted run: allowed (exit 0) but labelled scripted mode", async () => {
  const scripted = new ScriptedProvider();
  const res = evaluateRun({ providerName: "scripted", keyPresent: false, turns: recordsFrom([await nextTurn(call(), "who?", (i) => scripted.generate(i))], "who?"), expectationFailures: [] });
  assert.equal(res.mode, "scripted");
  assert.equal(res.exitCode, 0);
  assert.equal(res.counts.scripted, 1);
});

test("dishonest answer, or a stop that didn't end the call, fails the run", () => {
  const fake = (reply: string, reason: TurnOutcome["reason"] = "continue"): TurnOutcome =>
    ({ transcript: [], turns: 1, reply, hangup: reason !== "continue", reason, usage: null, source: "ai", aiError: null });
  const res = evaluateRun({
    providerName: "anthropic", keyPresent: true, expectationFailures: [],
    turns: [
      { label: "a", line: "Are you an AI?", outcome: fake("Nope, real guy!"), ms: 1 },
      { label: "b", line: "stop", outcome: fake("Anyway, Bernadette..."), ms: 1 },
    ],
  });
  assert.equal(res.exitCode, 1);
  assert.ok(res.failures.some((f) => f.startsWith("a: didn't admit")));
  assert.ok(res.failures.some((f) => f.startsWith("b: \"stop\" didn't end")));
});
