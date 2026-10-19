import type { Character, Scenario } from "@/lib/characters";

export type ChatTurn = { role: "user" | "character"; text: string };

export type GenerateInput = {
  character: Character;
  scenario: Scenario;
  history: ChatTurn[];
  userName?: string;
  spicy?: boolean; // 18+ opt-in: swearing and roasts allowed
  /** "phone" = live Twilio call: speech-to-text input, spoken output, can end the call. */
  channel?: "browser" | "phone";
  /** Phone calls: first name of the friend who sent the call (already announced in the disclosure). */
  senderName?: string;
  /** Phone calls: how many character replies remain, including this one. 1 = this is the last line. */
  repliesLeft?: number;
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
