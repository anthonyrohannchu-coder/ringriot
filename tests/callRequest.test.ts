import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { CallRequestBody } from "../src/lib/callRequest";
import { STANDING_KINDS } from "../src/lib/consent";

const ok = { senderName: "Anthony", phone: "(415) 555-2671", characterId: "sal", scenarioId: "hit-my-car", callerNumber: "+12084438421", senderAttests: true };

test("a normal call request with the sender's confirmation is accepted", () => {
  assert.equal(CallRequestBody.safeParse(ok).success, true);
});

test("no confirmation, false, or a string 'true' is rejected", () => {
  const { senderAttests: _, ...missing } = ok;
  for (const body of [missing, { ...ok, senderAttests: false }, { ...ok, senderAttests: "true" }]) {
    const r = CallRequestBody.safeParse(body);
    assert.equal(r.success, false);
    if (!r.success) assert.match(r.error.issues[0].message, /agreed|Expected|Required|true/i);
  }
});

test("the sender's promise never counts as the friend's own consent", () => {
  assert.ok(!(STANDING_KINDS as readonly string[]).includes("sender_attestation"));
});

test("the call page sends the confirmation from the checkbox", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../src/app/call/CallStudio.tsx", import.meta.url), "utf8");
  assert.match(src, /senderAttests: consent/);
  // and the Send button can't be pressed until the details step (incl. the checkbox) passes
  assert.match(src, /firstBlockingStep\(state\)/);
});
