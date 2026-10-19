import type { Character, Scenario } from "@/lib/characters";

export type ChatTurn = { role: "user" | "character"; text: string };

export type GenerateInput = {
  character: Character;
  scenario: Scenario;
  history: ChatTurn[];
  userName?: string;
};

export type GenerateResult = {
  text: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

/** Swap providers by implementing this one method. */
export interface ConversationProvider {
  name: string;
  generate(input: GenerateInput, signal?: AbortSignal): Promise<GenerateResult>;
}
