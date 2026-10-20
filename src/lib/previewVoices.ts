// Pure helpers for pre-recorded prank previews (ElevenLabs). No network here, so it's unit-testable.
import type { Cast } from "@/lib/people";

export type ElevenVoice = { voice_id: string; name: string; labels?: Record<string, string | undefined>; category?: string };

export const PREVIEW_BUCKET = "previews";
export const previewPath = (slug: string) => `${slug}.mp3`;

/** Public URL of a prank's preview clip (served by Supabase Storage). */
export function previewUrl(supabaseUrl: string | undefined, slug: string) {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${PREVIEW_BUCKET}/${previewPath(slug)}`;
}

/** What gets spoken: the opener without stage directions like *sniffs*, with tidy spacing. */
export function previewText(opener: string) {
  return opener.replace(/\*[^*]{1,40}\*/g, "").replace(/\s+/g, " ").trim();
}

const AGE_WORDS: Record<Cast["age"], RegExp> = {
  young: /young|teen/i,
  adult: /middle|adult/i,
  old: /old|elder|senior/i,
};

/** Score how well a voice fits a cast: gender must match; then age, then an American accent. */
export function voiceScore(v: ElevenVoice, cast: Cast) {
  const l = v.labels ?? {};
  const g = (l.gender ?? "").toLowerCase();
  const want = cast.gender === "m" ? "male" : "female";
  if (g && g !== want) return -1;
  if (!g) return -1;
  let s = 1;
  if (AGE_WORDS[cast.age].test(l.age ?? "")) s += 4;
  else if (cast.age === "adult" && !l.age) s += 1;
  const accent = (l.accent ?? "").toLowerCase();
  if (/american|us\b/.test(accent)) s += 3;
  else if (!accent) s += 1;
  return s;
}

/** Deterministic, spread-out voice choice: best fits first, rotating so voices repeat as rarely as possible. */
export function voicePicker(voices: ElevenVoice[]) {
  const uses = new Map<string, number>();
  return (cast: Cast): ElevenVoice | null => {
    const fits = voices
      .map((v) => ({ v, s: voiceScore(v, cast) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s || a.v.name.localeCompare(b.v.name));
    if (!fits.length) return null;
    const top = fits.filter((x) => x.s >= fits[0].s - 1);
    top.sort((a, b) => (uses.get(a.v.voice_id) ?? 0) - (uses.get(b.v.voice_id) ?? 0) || b.s - a.s || a.v.name.localeCompare(b.v.name));
    const pick = top[0].v;
    uses.set(pick.voice_id, (uses.get(pick.voice_id) ?? 0) + 1);
    return pick;
  };
}

/** Voice settings tuned per delivery: lower stability = more emotional range. */
export function voiceSettingsFor(cast: Cast) {
  const d = cast.delivery.toLowerCase();
  const intense = /panic|furious|frantic|excited|outraged|hysterical|breathless|sobbing|thrilled/.test(d);
  const flat = /deadpan|monotone|bored|flat/.test(d);
  return {
    stability: intense ? 0.3 : flat ? 0.7 : 0.45,
    similarity_boost: 0.8,
    style: intense ? 0.55 : flat ? 0.1 : 0.35,
    use_speaker_boost: true,
  };
}
