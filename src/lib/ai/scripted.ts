import type { ConversationProvider, GenerateInput, GenerateResult } from "./types";
import { END_TOKEN } from "./prompt";

/**
 * Zero-cost fallback used when no AI key is configured. It cycles through each
 * character's pre-written lines. The UI labels these replies as "scripted".
 */
export class ScriptedProvider implements ConversationProvider {
  name = "scripted";
  async generate({ character, scenario, history, spicy, channel }: GenerateInput): Promise<GenerateResult> {
    const replies = history.filter((t) => t.role === "character").length;
    // Scenario-specific lines first, so a scripted call still matches the chosen bit.
    const bank =
      spicy && channel !== "phone" ? character.spicyLines : scenario.fallbackLines?.length ? scenario.fallbackLines : character.fallbackLines;
    let text = bank[replies % bank.length];
    // On a phone call, a scenario's last scripted line is its goodbye: end the call there.
    if (channel === "phone" && bank === scenario.fallbackLines && replies >= bank.length - 1) text = `${bank[bank.length - 1]} ${END_TOKEN}`;
    return { text, provider: this.name, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  }
}
