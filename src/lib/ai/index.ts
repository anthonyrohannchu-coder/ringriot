import type { ConversationProvider } from "./types";
import { AnthropicProvider } from "./anthropic";
import { ScriptedProvider } from "./scripted";

let cached: ConversationProvider | null = null;

export function getProvider(): ConversationProvider {
  if (cached) return cached;
  const wanted = process.env.AI_PROVIDER || "anthropic";
  cached =
    wanted === "anthropic" && process.env.ANTHROPIC_API_KEY
      ? new AnthropicProvider()
      : new ScriptedProvider();
  return cached;
}

export * from "./types";
