// Situation-first prank library: every scenario is a browsable prank, tiers are preserved,
// the 11 new scenarios are complete, and nothing prompt-related reaches the browser.
import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { characters, findScenario, getCharacter } from "../src/lib/characters";
import { canUse, categories, featuredPranks, findPrank, prankMeta, pranks } from "../src/lib/pranks";
import { ScriptedProvider } from "../src/lib/ai/scripted";
import { buildSystemPrompt } from "../src/lib/ai/prompt";
import { nextTurn, openingTranscript, type CallRequest } from "../src/lib/callFlow";

const NEW = [
  ["tony", "taxi-order", "Order a Taxi"],
  ["gary", "junior-dad", "Kid Thinks You're His Dad"],
  ["brenda", "kid-suspended", "Your Kid Got Suspended"],
  ["earl", "smart-fridge", "Grandpa Is Terrified"],
  ["sal", "potato-lottery", "Fake Lottery Winner"],
  ["chad", "diss-track", "You Made a Diss Track About Me"],
  ["gary", "sushi-order", "Sushi Order"],
  ["tony", "new-neighbor", "Overly Friendly New Neighbor"],
  ["earl", "date-your-grandma", "Can I Date Your Grandma?"],
  ["jordan", "name-our-baby", "Help Us Name Our Baby"],
  ["dez", "high-school-hell", "You Made My Life Hell in High School"],
] as const;

test("every scenario is a prank with card copy, a unique slug and a known category", () => {
  const total = characters.reduce((n, c) => n + c.scenarios.length, 0);
  assert.equal(pranks.length, total);
  assert.equal(total, 50);
  assert.equal(new Set(pranks.map((p) => p.slug)).size, total);
  for (const c of characters) for (const s of c.scenarios) assert.ok(prankMeta[`${c.id}/${s.id}`], `missing card copy for ${c.id}/${s.id}`);
  assert.deepEqual(Object.keys(prankMeta).sort(), pranks.map((p) => `${p.characterId}/${p.scenarioId}`).sort(), "no orphan card copy");
  const ids = categories.map((c) => c.id) as string[];
  for (const p of pranks) assert.ok(ids.includes(p.category), p.slug);
  for (const c of categories) assert.ok(pranks.some((p) => p.category === c.id), `empty category ${c.id}`);
});

test("set 2: the 11 scenarios exist once each, are complete, and the two sexual ideas were reframed", () => {
  for (const [cid, sid, title] of NEW) {
    const c = getCharacter(cid)!;
    const s = findScenario(c, sid);
    assert.ok(s, `${cid}/${sid}`);
    assert.equal(s!.title, title);
    assert.ok(s!.persona && s!.setup && s!.ending && s!.opener, `${sid} incomplete`);
    assert.ok((s!.beats?.length ?? 0) >= 3, `${sid} beats`);
    assert.ok((s!.fallbackLines?.length ?? 0) >= 4, `${sid} fallbacks`);
    assert.equal(prankMeta[`${cid}/${sid}`].isNew, true);
  }
  const titles = pranks.map((p) => p.title.toLowerCase());
  assert.equal(titles.filter((t) => t === "secret crush").length, 1, "Secret Crush not duplicated");
  assert.equal(titles.filter((t) => t === "your dog pooped in my yard").length, 1, "Dog Pooped not duplicated");
  assert.ok(!titles.some((t) => /sexy|make a baby/.test(t)));
});

test("spoken lines of new scenarios stay clean (no sexual content, no money/scam asks)", () => {
  const banned = /\b(sexy|sex|kiss|hook ?up|bed|naked|cash|bank|fee|gift card|credit card|password|address|social security)\b/i;
  for (const [cid, sid] of NEW) {
    const s = findScenario(getCharacter(cid)!, sid)!;
    for (const line of [s.opener, ...(s.fallbackLines ?? [])]) assert.doesNotMatch(line, banned, `${sid}: ${line}`);
  }
  const lottery = findScenario(getCharacter("sal")!, "potato-lottery")!;
  assert.match(lottery.persona!, /NEVER mention cash/);
  const food = ["sushi-order"].map((id) => findScenario(getCharacter("gary")!, id)!);
  for (const s of food) assert.match(s.persona!, /no accents/);
});

test("tiers come from the voice: Chad and Earl pranks stay Pro-only", () => {
  for (const p of pranks) assert.equal(p.tier, getCharacter(p.characterId)!.tier);
  for (const p of pranks.filter((x) => x.characterId === "chad" || x.characterId === "earl")) assert.equal(p.tier, "pro");
  assert.equal(canUse("free", "plus"), false);
  assert.equal(canUse("plus", "pro"), false);
  assert.equal(canUse("pro", "pro"), true);
  assert.equal(canUse("plus", "free"), true);
  assert.ok(pranks.some((p) => p.tier === "free" && p.isNew), "free users get some new pranks too");
});

test("prank objects are public-safe and the client module never imports prompts", () => {
  const allowed = ["slug", "characterId", "scenarioId", "title", "blurb", "category", "icon", "isNew", "pick", "tier", "accent", "opener", "look"].sort();
  for (const p of pranks) assert.deepEqual(Object.keys(p).sort(), allowed);
  const json = JSON.stringify(pranks);
  assert.doesNotMatch(json, /"(persona|personality|fallbackLines|beats|setup|delivery|cast)"/);
  for (const f of ["src/lib/prankCategories.ts", "src/components/PrankCard.tsx", "src/components/PrankLibrary.tsx", "src/components/PrankArt.tsx", "src/app/call/CallStudio.tsx"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /from "@\/lib\/(characters|pranks|scenarios)"/, `${f} would bundle prompts into the browser`);
  }
});

test("lookups and featured list", () => {
  assert.equal(findPrank("sal-hit-my-car")?.title, "You Hit My Car!");
  assert.equal(findPrank("nope"), null);
  assert.equal(findPrank(undefined), null);
  assert.ok(featuredPranks.length >= 8);
  assert.deepEqual(featuredPranks.map((p) => p.pick), [...featuredPranks.map((p) => p.pick)].sort((a, b) => a! - b!));
});

test("every new scenario builds a phone prompt and runs a scripted call turn", async () => {
  for (const [cid, sid] of NEW) {
    const c = getCharacter(cid)!;
    const s = findScenario(c, sid)!;
    const prompt = buildSystemPrompt({ character: c, scenario: s, channel: "phone", senderName: "Anthony", history: [] } as never);
    assert.ok(prompt.includes(s.persona!.slice(0, 40)), `${sid} persona in prompt`);
    const base: CallRequest = { id: "33333333-3333-3333-3333-333333333333", user_id: "u", sender_name: "Anthony", character_id: cid, scenario_id: sid, transcript: [], turns: 0 };
    const r = { ...base, transcript: openingTranscript(base) };
    const p = new ScriptedProvider();
    const out = await nextTurn(r, "Wait, who is this?", (i) => p.generate(i));
    assert.ok(out.reply.length > 0, `${sid} replied`);
    assert.equal(out.hangup, false);
  }
});

const SET3 = [
  ["brenda", "pro-cuddler"], ["tony", "wild-grandma"], ["dez", "no-tip"], ["gary", "water-watch"], ["jordan", "shoe-fan-club"],
  ["jordan", "wifi-thief"], ["sal", "new-stepmom"], ["sal", "penguin-escape"], ["chad", "bowling-rival"], ["earl", "karaoke-partner"],
] as const;

test("set 3: 10 new pranks, each its own named person; duplicates and unsafe ideas weren't added as-is", () => {
  for (const [cid, sid] of SET3) {
    const s = findScenario(getCharacter(cid)!, sid)!;
    assert.ok(s, `${cid}/${sid}`);
    assert.ok(s.cast?.name && s.cast.style && s.cast.delivery, `${sid} has its own person`);
    assert.ok(s.persona && s.ending && (s.beats?.length ?? 0) >= 3 && (s.fallbackLines?.length ?? 0) >= 4, `${sid} complete`);
  }
  const titles = pranks.map((p) => p.title.toLowerCase());
  for (const bad of [/fetish/, /affair/, /homeless/, /tiger/]) assert.ok(!titles.some((t) => bad.test(t)), String(bad));
  assert.equal(titles.filter((t) => /secret crush/.test(t)).length, 1);
  assert.equal(titles.filter((t) => /grandpa is terrified/.test(t)).length, 1);
  const penguin = findScenario(getCharacter("sal")!, "penguin-escape")!;
  assert.match(penguin.persona!, /NO danger/);
  const all = characters.flatMap((c) => c.scenarios.flatMap((s) => [s.opener, ...(s.fallbackLines ?? [])]));
  for (const line of all) assert.doesNotMatch(line, /\b(sexy|fetish|affair|evacuate|lock your doors|call 911)\b/i, line);
});

test("every prank has a unique face and its own natural voice that matches the speaker", async () => {
  const { ALL_PHONE_VOICES, PHONE_VOICES } = await import("../src/lib/people");
  const keys = new Set<string>();
  const uses = new Map<string, number>();
  for (const c of characters) for (const s of c.scenarios) {
    const l = s.look!;
    const key = `${l.skin}|${l.hair}|${l.hairColor}|${l.accessory}|${l.shirt}`;
    assert.ok(!keys.has(key), `duplicate face for ${c.id}/${s.id}`);
    keys.add(key);
    const name = s.phoneVoice!.replace("Google.en-US-Chirp3-HD-", "");
    assert.ok(ALL_PHONE_VOICES.has(name), `${s.phoneVoice} is a known voice`);
    assert.ok((PHONE_VOICES[s.cast!.gender] as Record<string, readonly string[]>)[s.cast!.age].includes(name), `${c.id}/${s.id} voice matches gender/age`);
    uses.set(name, (uses.get(name) ?? 0) + 1);
    assert.ok(s.browserVoice && s.browserVoice.prefer === (s.cast!.gender === "f" ? "female" : "male"));
  }
  assert.ok(Math.max(...uses.values()) <= 3, "no voice used more than 3 times");
  // Neighbouring pranks of the same voice character never share a voice.
  for (const c of characters) for (let i = 1; i < c.scenarios.length; i++) {
    if (c.scenarios[i].cast!.gender === c.scenarios[i - 1].cast!.gender && c.scenarios[i].cast!.age === c.scenarios[i - 1].cast!.age)
      assert.notEqual(c.scenarios[i].phoneVoice, c.scenarios[i - 1].phoneVoice, `${c.id} ${i}`);
  }
});

test("prompt plays the prank's own person, tone and short phone replies", () => {
  const c = getCharacter("sal")!;
  const s = findScenario(c, "penguin-escape")!;
  const prompt = buildSystemPrompt({ character: c, scenario: s, channel: "phone", senderName: "Anthony", history: [] } as never);
  assert.match(prompt, /^You are Hank\./);
  assert.doesNotMatch(prompt, /You are Sal/);
  assert.match(prompt, /How you sound and feel in this call: slow, warm, creaky/);
  assert.match(prompt, /5 to 20 words/);
});
