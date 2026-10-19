// Automated conversation check for prank-call scenarios, through the SAME code path as live calls
// (callFlow.nextTurn). Uses the real AI when ANTHROPIC_API_KEY is in your environment.
// No phone, Twilio, database or credits. Writes transcripts + checks to call-check-report.md.
//
//   npm run call:check                       # the 11 prank-call scenarios
//   npm run call:check -- sal:hit-my-car     # just one (characterId:scenarioId), several allowed
//
// Never prints or stores the API key.
import { writeFileSync } from "node:fs";
import { getCharacter } from "../src/lib/characters";
import { getProvider } from "../src/lib/ai";
import { AI_TIMEOUT_MS, disclosureText, nextTurn, openingTranscript, type CallRequest, type TurnOutcome } from "../src/lib/callFlow";
import { evaluateRun, type TurnRecord } from "../src/lib/callCheck";
import { describeAIError, formatAIError, redactSecrets } from "../src/lib/ai/errors";

const PRANK_SCENARIOS = [
  "brenda:calling-my-boyfriend", "chad:snapchatting-my-girl", "sal:hit-my-car", "jordan:secret-crush",
  "brenda:mexican-food-order", "gary:bathroom-stall", "earl:dog-pooped", "dez:call-my-girlfriend",
  "sal:stay-away-from-my-girl", "gary:car-blocking", "earl:chinese-food-order",
];

// Simulated recipients. "" = silence (what Twilio sends when nobody speaks).
const RECIPIENTS: { name: string; lines: string[]; expect: (o: TurnOutcome) => string | null }[] = [
  {
    name: "plays along",
    lines: ["Hello? Who is this?", "Wait, what are you talking about?", "Okay, okay, I'm listening.", "Honestly that sounds ridiculous.",
      "Haha fine, what do you want me to do?", "I mean, sure, I guess.", "Alright, I think we're good here.", "Okay, bye!", "Bye."],
    expect: (o) => (["model_ended", "turn_limit", "recipient_left"].includes(o.reason) ? null : `ended with "${o.reason}", expected a wrap-up`),
  },
  {
    name: "skeptic asks if it's AI",
    lines: ["Who is this?", "I think you have the wrong number.", "Are you an AI?", "Okay. I really have to go now.", "Bye.", "Bye."],
    expect: (o) => (o.hangup ? null : "call did not end after 'I really have to go'"),
  },
  {
    name: "asks questions, says unexpected things",
    lines: ["What's your name?", "Why are you calling ME specifically?", "I'm actually a penguin.", "What did you have for breakfast?",
      "Do you even know who I am?", "Okay this is fun but I have to go."],
    expect: (o) => (["recipient_left", "model_ended"].includes(o.reason) ? null : `ended with "${o.reason}", expected a goodbye (at the latest after "I have to go")`),
  },
  {
    name: "silence, then asks to stop",
    lines: ["", "Hello? I can barely hear you.", "Please stop calling me."],
    expect: (o) => (o.reason === "asked_to_stop" ? null : `ended with "${o.reason}", expected asked_to_stop`),
  },
  {
    name: "never answers",
    lines: ["", ""],
    expect: (o) => (o.reason === "silence" ? null : `ended with "${o.reason}", expected silence`),
  },
];

const TAG: Record<TurnOutcome["source"], string> = { ai: "AI", scripted: "SCRIPTED", fallback: "AI FAILED → fallback", safeguard: "safeguard" };

async function main() {
  const picks = process.argv.slice(2).length ? process.argv.slice(2) : PRANK_SCENARIOS;
  const provider = getProvider();
  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
  const keyPresent = !!process.env.ANTHROPIC_API_KEY?.trim(); // presence only; the value is never printed
  const realAI = provider.name !== "scripted";
  const header = [
    `# RingRiot call check`, ``,
    `- Mode: **${realAI ? `REAL AI (${provider.name}, model ${model})` : "SCRIPTED ONLY: not a real AI test"}**`,
    `- ANTHROPIC_API_KEY in environment: ${keyPresent ? "yes" : "no"}`,
    `- AI timeout per turn on calls: ${AI_TIMEOUT_MS} ms (Twilio waits 15 s)`, ``,
  ];

  // Preflight: one real request. If the provider rejects it, report the exact (secret-free) error now.
  if (realAI) {
    const c = getCharacter("sal")!;
    const scenario = c.scenarios.find((x) => x.id === "hit-my-car")!;
    const t0 = Date.now();
    try {
      const res = await provider.generate(
        { character: c, scenario, history: [{ role: "user", text: "Hello? Who is this?" }], channel: "phone", senderName: "Anthony", repliesLeft: 8 },
        AbortSignal.timeout(AI_TIMEOUT_MS),
      );
      console.log(`Preflight OK: ${provider.name} replied in ${Date.now() - t0} ms (${res.inputTokens} in / ${res.outputTokens} out tokens).`);
    } catch (err) {
      const e = describeAIError(err, model);
      const lines = [...header, `## Preflight FAILED`, ``, `- Error: \`${formatAIError(e)}\``, `- Fix: ${e.hint}`, ``,
        `No scenarios were run: every AI turn would fail the same way and fall back to canned lines.`];
      writeFileSync("call-check-report.md", lines.join("\n"));
      console.error(`Preflight FAILED after ${Date.now() - t0} ms: ${formatAIError(e)}\nFix: ${e.hint}`);
      process.exit(1);
    }
  }

  const out: string[] = [];
  const records: TurnRecord[] = [];
  const expectationFailures: string[] = [];
  let maxMs = 0;

  for (const pick of picks) {
    const [charId, scenarioId] = pick.split(":");
    const c = getCharacter(charId);
    const s = c?.scenarios.find((x) => x.id === scenarioId);
    if (!c || !s) { expectationFailures.push(`${pick}: unknown scenario`); continue; }
    out.push(`## ${s.title} — ${c.name} (${c.tier})`, ``);

    for (const who of RECIPIENTS) {
      const label = `${s.title} / ${who.name}`;
      let r: CallRequest = { id: "check", user_id: "check", sender_name: "Anthony", character_id: c.id, scenario_id: s.id, transcript: [], turns: 0 };
      r.transcript = openingTranscript(r);
      out.push(`### Recipient: ${who.name}`, ``, `> _(disclosure)_ ${disclosureText("Anthony")}`, `>`, `> **${c.name}:** ${r.transcript[0].text}`);
      let last: TurnOutcome | null = null;
      for (const line of who.lines) {
        const t0 = Date.now();
        last = await nextTurn(r, line, (input, signal) => provider.generate(input, signal));
        const ms = Date.now() - t0;
        maxMs = Math.max(maxMs, ms);
        records.push({ label, line, outcome: last, ms });
        const err = last.aiError ? `: ${formatAIError(last.aiError)}` : "";
        out.push(`> **Friend:** ${line || "_(silence)_"}`, `> **${c.name}:** ${last.reply}  _([${TAG[last.source]}${err}] ${ms} ms${last.hangup ? `, hung up: ${last.reason}` : ""})_`);
        if (last.hangup) break;
        r = { ...r, transcript: last.transcript, turns: last.turns };
      }
      const verdict = last ? who.expect(last) : "no turns ran";
      if (verdict) expectationFailures.push(`${label}: ${verdict}`);
      out.push(``, verdict ? `**Check: ✗ ${verdict}**` : `Check: ✓ ended as expected (${last!.reason})`, ``);
    }
  }

  const result = evaluateRun({ providerName: provider.name, keyPresent, turns: records, expectationFailures });
  const c = result.counts;
  const summary = [
    `## Summary: ${result.exitCode === 0 ? "PASS" : "FAIL"} (${result.mode})`, ``,
    `- Scenarios: ${picks.length} · simulated calls: ${picks.length * RECIPIENTS.length} · turns: ${records.length} · slowest: ${maxMs} ms`,
    `- Replies: **${c.ai} genuine AI** · ${c.fallback} AI-failed fallbacks · ${c.scripted} scripted · ${c.safeguard} safeguard (stop/silence, no AI call)`,
    result.failures.length ? `- **${result.failures.length} failure(s):**\n${result.failures.map((p) => `  - ${p}`).join("\n")}` : `- No failures.`,
    result.warnings.length ? `- ${result.warnings.length} warning(s) to review:\n${result.warnings.map((p) => `  - ${p}`).join("\n")}` : `- No warnings.`,
    result.mode === "scripted" ? `- NOTE: scripted lines only. This is NOT a real AI test.` : `- Still read the transcripts: naturalness and humor need a human.`,
    ``,
  ];
  writeFileSync("call-check-report.md", [...header, ...summary, ...out].join("\n"));
  console.log(summary.join("\n"));
  console.log(`Full transcripts: call-check-report.md`);
  process.exit(result.exitCode);
}

main().catch((e) => { console.error(e instanceof Error ? redactSecrets(e.message) : e); process.exit(1); });
