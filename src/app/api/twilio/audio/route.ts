import { NextResponse, type NextRequest } from "next/server";
import { checkSig } from "@/lib/twilio";
import { loadRequest } from "@/lib/callEngine";
import { getCharacter } from "@/lib/characters";
import { synthesize, voiceFor } from "@/lib/tts";
import { logProviderUsage } from "@/lib/credits";

// Twilio <Play>s this: one line of a call, voiced by ElevenLabs. URL is signed per line.
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("req") ?? "";
  const t = Number(req.nextUrl.searchParams.get("t") ?? "-1");
  if (!checkSig(`${id}:${t}`, req.nextUrl.searchParams.get("sig"))) return new NextResponse("forbidden", { status: 403 });

  const r = await loadRequest(id);
  const line = r?.transcript?.[t];
  if (!r || !line || line.role !== "character") return new NextResponse("not found", { status: 404 });
  const c = getCharacter(r.character_id)!;
  const text = line.text.replace(/\*[^*]{1,30}\*/g, "");

  try {
    const out = await synthesize(text, voiceFor(c.id, c.voice.elevenlabsVoiceId) ?? "", { force: true, format: "mp3_22050_32" });
    if (!out) throw new Error("tts unavailable");
    await logProviderUsage({ user_id: r.user_id, provider: "elevenlabs", kind: "tts", units: text.length, cost_usd: out.costUsd });
    return new NextResponse(new Uint8Array(out.audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("call tts failed", err);
    // Twilio skips a failed <Play>; the call continues to the next listen step.
    return new NextResponse("tts failed", { status: 502 });
  }
}
