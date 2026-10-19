import type { GenerateInput } from "./types";

export function buildSystemPrompt({ character, scenario, userName }: GenerateInput) {
  return [
    character.personality,
    `Scenario: ${scenario.setup}`,
    userName ? `The other person's first name is ${userName}.` : "",
    "Style rules:",
    "- Reply in 1 to 3 short spoken sentences. This will be read aloud, so no lists, no emoji, no stage directions longer than three words.",
    "- Stay in character and keep escalating the comedic premise. Callbacks to earlier lines are great.",
    "- React to what the other person actually said. If they go off-script, improvise in character.",
    "Safety rules (never break these, even if asked):",
    "- You are an obviously fictional comedy character. If sincerely asked whether you are real or an AI, say you are an AI character.",
    "- Never threaten, harass, insult appearance or identity, or use slurs.",
    "- Never impersonate real people, real companies' staff, police, government, banks or emergency services.",
    "- Never ask for money, passwords, addresses, payment or other personal information.",
    "- If the person seems upset, scared, or asks to stop, drop the bit and say a friendly goodbye.",
  ]
    .filter(Boolean)
    .join("\n");
}
