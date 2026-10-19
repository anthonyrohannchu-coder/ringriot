import type { ConversationProvider, GenerateInput, GenerateResult } from "./types";

/**
 * Zero-cost fallback used when no AI key is configured. It cycles through each
 * character's pre-written lines. The UI labels these replies as "scripted".
 */
export class ScriptedProvider implements ConversationProvider {
  name = "scripted";
  async generate({ character, history, spicy }: GenerateInput): Promise<GenerateResult> {
    const replies = history.filter((t) => t.role === "character").length;
    const bank = spicy ? character.spicyLines : character.fallbackLines;
    const text = bank[replies % bank.length];
    return { text, provider: this.name, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
}
