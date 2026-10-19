// Server-side premium TTS. Returns null when not configured; the browser then
// uses its own free voices with each character's pitch/rate.

const costPer1k = Number(process.env.TTS_COST_PER_1K_CHARS || 0.1);

export function elevenlabsAvailable() {
  return !!process.env.ELEVENLABS_API_KEY;
}

/** Voice for a character: ELEVENLABS_VOICE_MAP (JSON {"tony":"voiceId"}) overrides the defaults. */
export function voiceFor(characterId: string, fallback?: string) {
  try {
    const map = JSON.parse(process.env.ELEVENLABS_VOICE_MAP || "{}") as Record<string, string>;
    return map[characterId] || fallback;
  } catch {
    return fallback;
  }
}

export function premiumTtsEnabled() {
  return process.env.TTS_PROVIDER === "elevenlabs" && !!process.env.ELEVENLABS_API_KEY;
}

export async function synthesize(text: string, voiceId: string, opts: { force?: boolean; format?: string } = {}) {
  if (!(opts.force ? elevenlabsAvailable() : premiumTtsEnabled())) return null;
  const fmt = opts.format ? `?output_format=${opts.format}` : "";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}${fmt}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5" }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  const audio = Buffer.from(await res.arrayBuffer());
  return { audio, costUsd: (text.length / 1000) * costPer1k };
}
