import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCharacter } from "@/lib/characters";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { premiumTtsEnabled, synthesize } from "@/lib/tts";
import { logProviderUsage } from "@/lib/credits";

const Body = z.object({ characterId: z.string().max(40), text: z.string().min(1).max(400) });

// Premium voices are a Pro feature. Everyone else gets free browser voices.
export async function POST(req: NextRequest) {
  if (!premiumTtsEnabled()) return NextResponse.json({ error: "tts_not_configured" }, { status: 501 });
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const { data: profile } = await supabaseAdmin().from("profiles").select("plan").eq("id", user.id).single();
  if (profile?.plan !== "pro") return NextResponse.json({ error: "upgrade_required" }, { status: 402 });

  const character = getCharacter(parsed.data.characterId);
  const voiceId = character?.voice.elevenlabsVoiceId;
  if (!voiceId) return NextResponse.json({ error: "no_premium_voice" }, { status: 404 });

  try {
    const out = await synthesize(parsed.data.text, voiceId);
    if (!out) return NextResponse.json({ error: "tts_not_configured" }, { status: 501 });
    await logProviderUsage({ user_id: user.id, provider: "elevenlabs", kind: "tts", units: parsed.data.text.length, cost_usd: out.costUsd });
    return new NextResponse(new Uint8Array(out.audio), { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "tts_failed" }, { status: 502 });
  }
}
