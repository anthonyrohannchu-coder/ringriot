import Anthropic from "@anthropic-ai/sdk";
import type { ConversationProvider, GenerateInput, GenerateResult } from "./types";
import { buildSystemPrompt } from "./prompt";

const inCost = Number(process.env.AI_COST_PER_MTOK_INPUT || 1);
const outCost = Number(process.env.AI_COST_PER_MTOK_OUTPUT || 5);

export class AnthropicProvider implements ConversationProvider {
  name = "anthropic";
  private client: Anthropic;
  private model = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";

  /** `options` lets tests point the real SDK at a fake API (e.g. a custom fetch); production passes nothing. */
  constructor(options: ConstructorParameters<typeof Anthropic>[0] = {}) {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, ...options });
  }

  async generate(input: GenerateInput, signal?: AbortSignal): Promise<GenerateResult> {
    // The opener is the character's first message; the API needs a user turn first.
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "(The call connects.)" },
      { role: "assistant", content: input.scenario.opener },
      ...input.history.map((t) => ({
        role: t.role === "user" ? ("user" as const) : ("assistant" as const),
        content: t.text.slice(0, 600),
      })),
    ];

    const res = await this.client.messages.create(
      {
        model: this.model,
        // Phone replies must stay short (5-20 words); the browser demo can run a little longer.
        max_tokens: input.channel === "phone" ? 90 : 160,
        temperature: 1,
        system: buildSystemPrompt(input),
        messages,
      },
      { signal, timeout: 15_000 },
    );

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();

    const inputTokens = res.usage.input_tokens;
    const outputTokens = res.usage.output_tokens;
    return {
      text: text || "...Sorry, the line crackled. Say that again?",
      provider: this.name,
      inputTokens,
      outputTokens,
      costUsd: (inputTokens * inCost + outputTokens * outCost) / 1_000_000,
    };
  }
}
