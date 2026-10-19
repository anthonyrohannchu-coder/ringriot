// The REAL AnthropicProvider + Anthropic SDK against a fake Anthropic API (custom fetch): request shape,
// response parsing, and the exact error each common rejection produces through a live-call turn.
// Needs the SDK installed (npm ci); skipped where it isn't.
import "./helpers/env";
import { test, type TestContext } from "node:test";
import assert from "node:assert/strict";
import { nextTurn, openingTranscript, type CallRequest } from "../src/lib/callFlow";

const FAKE_KEY = "sk-ant-api03-FAKE-KEY-FOR-PROVIDER-TESTS-000000000000";
type Captured = { url: string; headers: Headers; body: Record<string, unknown> };

async function provider(t: TestContext, respond: (c: Captured) => Response) {
  let mod: typeof import("../src/lib/ai/anthropic");
  try {
    mod = await import("../src/lib/ai/anthropic");
  } catch {
    t.skip("@anthropic-ai/sdk not installed here (runs after npm ci)");
    return null;
  }
  process.env.ANTHROPIC_API_KEY = FAKE_KEY;
  const captured: Captured[] = [];
  const fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const c = { url: String(url), headers: new Headers(init?.headers), body: JSON.parse(String(init?.body ?? "{}")) };
    captured.push(c);
    return respond(c);
  };
  const p = new mod.AnthropicProvider({ fetch: fetch as never, maxRetries: 0 });
  return { p, captured };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_test" } });
const apiErr = (status: number, type: string, message: string) => json(status, { type: "error", error: { type, message } });

const call = (): CallRequest => {
  const r: CallRequest = { id: "44444444-4444-4444-4444-444444444444", user_id: "u", sender_name: "Anthony", character_id: "sal", scenario_id: "hit-my-car", transcript: [], turns: 0 };
  return { ...r, transcript: openingTranscript(r) };
};

test("success: real provider sends a valid request and its reply is a genuine AI turn", async (t) => {
  const h = await provider(t, () => json(200, {
    id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", stop_reason: "end_turn", stop_sequence: null,
    content: [{ type: "text", text: "Bernadette's my car, man! Why'd you graze her?" }],
    usage: { input_tokens: 812, output_tokens: 14 },
  }));
  if (!h) return;
  const out = await nextTurn(call(), "Wait, who is Bernadette?", (i, s) => h.p.generate(i, s));
  assert.equal(out.source, "ai");
  assert.equal(out.reply, "Bernadette's my car, man! Why'd you graze her?");
  assert.equal(out.usage?.inputTokens, 812);

  const req = h.captured[0];
  assert.match(req.url, /\/v1\/messages$/);
  assert.ok(req.headers.get("x-api-key"), "key is sent as a header");
  assert.equal(req.body.model, process.env.ANTHROPIC_MODEL || "claude-haiku-5-5");
  assert.equal(typeof req.body.max_tokens, "number");
  const msgs = req.body.messages as { role: string; content: string }[];
  assert.equal(msgs[0].role, "user");
  assert.equal(msgs.at(-1)!.role, "user");
  assert.equal(msgs.at(-1)!.content, "Wait, who is Bernadette?");
  for (let i = 1; i < msgs.length; i++) assert.notEqual(msgs[i].role, msgs[i - 1].role, "roles alternate");
  assert.match(String(req.body.system), /RIGHT NOW: They asked "Wait, who is Bernadette\?"/);
});

for (const [name, status, type, message, kind] of [
  ["invalid key", 401, "authentication_error", "invalid x-api-key", "auth"],
  ["model not available", 404, "not_found_error", "model: claude-haiku-5-5", "model"],
  ["no credit", 400, "invalid_request_error", "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.", "billing"],
  ["permission", 403, "permission_error", "Your API key does not have permission to use the specified resource.", "permission"],
] as const) {
  test(`${name}: the turn falls back AND says exactly why (${status} ${type})`, async (t) => {
    const h = await provider(t, () => apiErr(status, type, message));
    if (!h) return;
    const out = await nextTurn(call(), "Wait, who is Bernadette?", (i, s) => h.p.generate(i, s));
    assert.equal(out.source, "fallback");
    assert.equal(out.aiError?.kind, kind);
    assert.equal(out.aiError?.status, status);
    assert.equal(out.aiError?.type, type);
    assert.ok(!JSON.stringify(out).includes(FAKE_KEY));
  });
}
