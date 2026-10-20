// ElevenLabs text-to-speech, used for (1) pre-recorded prank previews and (2) optionally the live
// call voice. Calls use Twilio's natural Google voices unless ELEVENLABS_FOR_CALLS=1, because
// ElevenLabs on every call line costs far more per call.

const costPer1k = Number(process.env.TTS_COST_PER_1K_CHARS || 0.1);

export function elevenlabsAvailable() {
  return !!process.env.ELEVENLABS_API_KEY;
}

/** Live calls speak through ElevenLabs only when explicitly enabled (cost control). */
export function elevenlabsForCalls() {
  return elevenlabsAvailable() && process.env.ELEVENLABS_FOR_CALLS === "1";
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

export async function synthesize(
  text: string,
  voiceId: string,
  opts: { format?: string; model?: string; voiceSettings?: Record<string, number | boolean> } = {},
) {
  if (!elevenlabsAvailable()) return null;
  const fmt = opts.format ? `?output_format=${opts.format}` : "";
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}${fmt}`, {
    method: "POST",
    headers: {
      "xi-api-key": process.env.ELEVENLABS_API_KEY!,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: opts.model || process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
      ...(opts.voiceSettings ? { voice_settings: opts.voiceSettings } : {}),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
  const audio = Buffer.from(await res.arrayBuffer());
  return { audio, costUsd: (text.length / 1000) * costPer1k };
}
