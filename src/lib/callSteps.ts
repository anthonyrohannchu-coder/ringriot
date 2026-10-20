// Pure logic for the Send-a-call wizard and the live call tracker (client-safe, unit-tested).
import { friendNumberProblem } from "@/lib/phone";

export const WIZARD_STEPS = [
  { id: "prank", label: "Prank" },
  { id: "friend", label: "Friend Number" },
  { id: "caller", label: "Prank Caller Number" },
  { id: "details", label: "Details" },
  { id: "review", label: "Review" },
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number]["id"];

export type WizardState = {
  prankUsable: boolean;
  friendNumber: string;
  callerNumber: string;
  callerNumbers: string[];
  senderName: string;
  consent: boolean;
  credits: number;
  cost: number;
};

const NAME_OK = /^[\p{L}\p{N} .'\-]{1,30}$/u;

/** The reason the user can't move past `step`, or null when they can. Mirrors the server's checks. */
export function stepProblem(step: WizardStep, s: WizardState): string | null {
  switch (step) {
    case "prank":
      return s.prankUsable ? null : "This prank isn't on your plan. Pick another or upgrade.";
    case "friend":
      return friendNumberProblem(s.friendNumber);
    case "caller":
      if (!s.callerNumbers.length) return "No Prank Caller Numbers are set up yet.";
      return s.callerNumbers.includes(s.callerNumber) ? null : "Choose a Prank Caller Number.";
    case "details":
      if (!s.senderName.trim()) return "Add your name so your friend knows who sent it.";
      if (!NAME_OK.test(s.senderName.trim())) return "Use letters, numbers and spaces only (max 30).";
      return s.consent ? null : "Confirm your friend would be OK with this.";
    case "review":
      return s.credits < s.cost ? `You need ${s.cost} credits (you have ${s.credits}).` : null;
  }
}

/** First step with a problem (so "Send" can jump back to it), or null when everything is ready. */
export function firstBlockingStep(s: WizardState): WizardStep | null {
  for (const st of WIZARD_STEPS) if (stepProblem(st.id, s)) return st.id;
  return null;
}

// ---------- live tracker ----------

export const TRACK_STEPS = [
  { id: "sent", label: "Text sent", hint: "Your friend got the heads-up text." },
  { id: "yes", label: "They said YES", hint: "One YES, one time. After this your pranks ring them directly." },
  { id: "ringing", label: "Ringing", hint: "Calling from your Prank Caller Number." },
  { id: "live", label: "On the call", hint: "The character is talking to them right now." },
  { id: "done", label: "Done", hint: "Recording and results below." },
] as const;

const REACHED: Record<string, number> = {
  awaiting_consent: 0,
  calling: 2,
  in_progress: 3,
  completed: 4,
};
export const FINAL = new Set(["completed", "declined", "expired", "no_answer", "failed", "blocked"]);
export const isFinal = (status: string) => FINAL.has(status);

/** Index of the last tracker step reached, plus how the call ended if it stopped early. */
export function trackProgress(status: string): { reached: number; stoppedAt?: string } {
  if (status in REACHED) return { reached: REACHED[status] };
  switch (status) {
    case "declined": return { reached: 0, stoppedAt: "They said no. No credits used." };
    case "expired": return { reached: 0, stoppedAt: "They didn't reply in time. No credits used." };
    case "blocked": return { reached: 0, stoppedAt: "That number opted out of RingRiot. No credits used." };
    case "no_answer": return { reached: 2, stoppedAt: "They didn't pick up. Credits refunded." };
    case "failed": return { reached: 1, stoppedAt: "The call couldn't connect. Credits refunded." };
    default: return { reached: 0 };
  }
}

/** Credits a call actually cost: charged when they say YES, refunded unless it was answered. */
export function creditsUsed(status: string, cost: number) {
  return status === "completed" || status === "in_progress" || status === "calling" ? cost : 0;
}
