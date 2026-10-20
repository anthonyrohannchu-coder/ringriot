// Client-safe phone helpers (no Node APIs). The server re-validates everything with the same rules.

/** Countries RingRiot can actually call today. Both use +1 (NANP); nothing else is offered. */
export const FRIEND_COUNTRIES = [
  { code: "US", name: "United States", dial: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dial: "+1", flag: "🇨🇦" },
] as const;
export type FriendCountry = (typeof FRIEND_COUNTRIES)[number]["code"];

const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

/** US/Canada number → E.164 (+1XXXXXXXXXX), or null for invalid, toll-free, premium or N11 numbers. */
export function normalizeNumber(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  const area = d.slice(0, 3), exch = d.slice(3, 6);
  if (!/[2-9]/.test(area[0]) || !/[2-9]/.test(exch[0])) return null;
  if (area[1] === "1" && area[2] === "1") return null; // N11
  if (exch[1] === "1" && exch[2] === "1") return null;
  if (TOLL_FREE.has(area) || area === "900") return null;
  return `+1${d}`;
}

/** Why a typed friend number isn't usable yet, or null when it's fine. */
export function friendNumberProblem(input: string): string | null {
  const d = input.replace(/\D/g, "");
  if (!d) return "Enter your friend's number.";
  if (d.length < 10) return "That's too short. Use the full 10-digit number.";
  if (d.length > 11 || (d.length === 11 && !d.startsWith("1"))) return "Only US and Canadian numbers (+1) work right now.";
  const area = d.slice(-10, -7);
  if (TOLL_FREE.has(area) || area === "900") return "Toll-free and premium numbers can't be called.";
  if (!normalizeNumber(input)) return "That doesn't look like a real US or Canadian number.";
  return null;
}

/** +12083334444 → (208) 333-4444 */
export function formatNumber(e164: string) {
  const d = e164.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : e164;
}

/** Live formatting while typing: 2083334444 → (208) 333-4444 */
export function formatAsTyped(input: string) {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
