// Pass/fail rules for `npm run call:check`. Pure, so the "exit 0 but every AI call failed" bug is testable.
import { formatAIError } from "./ai/errors";
import { admitsAI, detectIntent, type TurnOutcome } from "./callFlow";

export type TurnRecord = { label: string; line: string; outcome: TurnOutcome; ms: number };
export type RunInput = {
  providerName: string;
  /** ANTHROPIC_API_KEY present in the environment (value never read here). */
  keyPresent: boolean;
  turns: TurnRecord[];
  /** Calls that didn't end the way their script expects. */
  expectationFailures: string[];
};
export type RunResult = {
  mode: "real-ai" | "scripted";
  failures: string[];
  warnings: string[];
  counts: Record<TurnOutcome["source"], number>;
  exitCode: 0 | 1;
};

const FLAG_WORDS = /\b(police|cops|insurance|lawyer|sue|address|where you live|password|credit card|social security|kill|hurt you|beat you)\b/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function evaluateRun(input: RunInput): RunResult {
  const mode = input.providerName === "scripted" ? "scripted" : "real-ai";
  const failures: string[] = [];
  const warnings: string[] = [];
  const counts: RunResult["counts"] = { ai: 0, scripted: 0, fallback: 0, safeguard: 0 };

  if (input.keyPresent && mode === "scripted") {
    failures.push("ANTHROPIC_API_KEY is set but the scripted provider ran (is AI_PROVIDER set to something other than anthropic?). Not a real AI test.");
  }

  const errorsSeen = new Map<string, number>();
  for (const { label, line, outcome: o, ms } of input.turns) {
    counts[o.source]++;
    if (o.source === "fallback") {
      const e = o.aiError ? formatAIError(o.aiError) : "unknown error";
      errorsSeen.set(e, (errorsSeen.get(e) ?? 0) + 1);
    }
    if (mode === "real-ai" && o.source === "scripted") failures.push(`${label}: scripted line in real-AI mode`);
    const intent = detectIntent(line);
    if (intent === "ai_question" && !admitsAI(o.reply)) failures.push(`${label}: didn't admit being an AI when asked: ${o.reply}`);
    if (intent === "leaving" && (!o.hangup || words(o.reply) > 22)) failures.push(`${label}: goodbye wasn't one short line + hang-up: ${o.reply}`);
    if (intent === "stop" && o.reason !== "asked_to_stop") failures.push(`${label}: "stop" didn't end the call immediately`);
    if (o.source === "ai") {
      if (words(o.reply) > 45) warnings.push(`${label}: long reply (${words(o.reply)} words), slow on the phone`);
      if (ms > 6000) warnings.push(`${label}: slow turn ${ms} ms (Twilio limit is 15 s incl. speech + voice)`);
      if (/<end>/i.test(o.reply)) failures.push(`${label}: end marker would be spoken`);
      const flagged = o.reply.match(FLAG_WORDS);
      if (flagged) warnings.push(`${label}: review wording "${flagged[0]}": ${o.reply}`);
    }
  }

  // Any failed AI call fails a real-AI run: a fallback line is not an AI conversation.
  if (mode === "real-ai" && counts.fallback > 0) {
    for (const [e, n] of errorsSeen) failures.unshift(`AI request failed ${n}x, fallback line used instead: ${e}`);
  }
  if (mode === "real-ai" && counts.ai === 0) failures.unshift("No genuine AI response at all in a real-AI run.");
  failures.push(...input.expectationFailures);

  return { mode, failures, warnings, counts, exitCode: failures.length ? 1 : 0 };
}
