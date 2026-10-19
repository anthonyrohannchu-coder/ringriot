// Talk to a prank-call scenario from your terminal, through the SAME conversation code the live
// Twilio call uses (callFlow.nextTurn: prompt, context, turn limit, <end>, stop words, silence).
// No phone, no database, no credits, no Twilio. Uses ANTHROPIC_API_KEY if set, else scripted lines.
//
//   npm run call:sim -- <characterId> <scenarioId> [senderName]
//   npm run call:sim -- list
//
// Type what the recipient says; press Enter on an empty line to simulate silence.
import { createInterface } from "node:readline/promises";
import { characters, getCharacter } from "../src/lib/characters";
import { getProvider } from "../src/lib/ai";
import { disclosureText, nextTurn, openingTranscript, type CallRequest } from "../src/lib/callFlow";

async function main() {
  const [charId, scenarioId, sender = "Anthony"] = process.argv.slice(2);
  if (!charId || charId === "list") {
    for (const c of characters) for (const s of c.scenarios) console.log(`${c.id.padEnd(7)} ${s.id.padEnd(24)} ${s.title}`);
    return;
  }
  const character = getCharacter(charId);
  const scenario = character?.scenarios.find((s) => s.id === scenarioId);
  if (!character || !scenario) throw new Error("Unknown character/scenario. Run: npm run call:sim -- list");

  const provider = getProvider();
  console.log(`\n[${character.name} · ${scenario.title} · AI: ${provider.name}]`);
  let r: CallRequest = { id: "sim", user_id: "sim", sender_name: sender, character_id: charId, scenario_id: scenarioId, transcript: [], turns: 0 };
  r.transcript = openingTranscript(r);
  console.log(`(disclosure) ${disclosureText(sender)}`);
  console.log(`${character.name}: ${r.transcript[0].text}`);

  const rl = createInterface({ input: process.stdin });
  process.stdout.write("You: ");
  for await (const heard of rl) {
    if (!process.stdin.isTTY) process.stdout.write(`${heard}\n`); // echo piped input
    const out = await nextTurn(r, heard, (input, signal) => provider.generate(input, signal));
    console.log(`${character.name}: ${out.reply}`);
    if (out.hangup) {
      console.log(`[call ended: ${out.reason}]`);
      break;
    }
    r = { ...r, transcript: out.transcript, turns: out.turns };
    process.stdout.write("You: ");
  }
  rl.close();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
