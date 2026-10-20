import { NextResponse, type NextRequest } from "next/server";
import { isAdmin } from "@/lib/admin";
import { characters } from "@/lib/characters";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";
import { elevenlabsAvailable, synthesize } from "@/lib/tts";
import {
  PREVIEW_BUCKET, previewPath, previewText, voicePicker, voiceSettingsFor, type ElevenVoice,
} from "@/lib/previewVoices";

// Admin-only: pre-records each prank's opener with its own human-sounding ElevenLabs voice and stores
// it in the public Supabase Storage bucket "previews", so Preview buttons play a real voice instead of
// the browser's robot voice. Rendering happens once per prank (uses ElevenLabs characters), not per visitor.
//   GET  /api/admin/previews                → what exists / what's missing + character estimate
//   POST /api/admin/previews?limit=10       → render up to `limit` missing clips (&force=1 re-renders)
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function allPranks() {
  return characters.flatMap((c) => c.scenarios.map((s) => ({ slug: `${c.id}-${s.id}`, cast: s.cast!, text: previewText(s.opener) })));
}

async function existing() {
  const { data, error } = await supabaseAdmin().storage.from(PREVIEW_BUCKET).list("", { limit: 1000 });
  if (error) return new Set<string>();
  return new Set(data.map((f) => f.name));
}

export async function GET() {
  if (!(await isAdmin())) return new NextResponse("Not found", { status: 404 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  const have = await existing();
  const list = allPranks();
  const missing = list.filter((p) => !have.has(previewPath(p.slug)));
  return NextResponse.json({
    elevenlabs: elevenlabsAvailable(),
    total: list.length,
    rendered: list.length - missing.length,
    missing: missing.map((p) => p.slug),
    missingCharacters: missing.reduce((n, p) => n + p.text.length, 0),
  });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return new NextResponse("Not found", { status: 404 });
  if (!supabaseConfigured()) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  if (!elevenlabsAvailable()) return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 503 });

  const limit = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 10) || 10));
  const force = req.nextUrl.searchParams.get("force") === "1";
  const model = req.nextUrl.searchParams.get("model") || process.env.ELEVENLABS_PREVIEW_MODEL || "eleven_multilingual_v2";
  const only = req.nextUrl.searchParams.get("slug");

  const db = supabaseAdmin();
  const bucket = await db.storage.getBucket(PREVIEW_BUCKET);
  if (bucket.error) {
    const made = await db.storage.createBucket(PREVIEW_BUCKET, { public: true, allowedMimeTypes: ["audio/mpeg"], fileSizeLimit: 2_000_000 });
    if (made.error) return NextResponse.json({ error: `couldn't create bucket: ${made.error.message}` }, { status: 500 });
  }

  const vr = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! }, signal: AbortSignal.timeout(15_000) });
  if (!vr.ok) return NextResponse.json({ error: `ElevenLabs voices: HTTP ${vr.status}` }, { status: 502 });
  const voices = ((await vr.json()).voices ?? []) as ElevenVoice[];
  const pick = voicePicker(voices);

  // Assign voices across ALL pranks in a stable order so each prank keeps its voice between runs.
  const assigned = allPranks().map((p) => ({ ...p, voice: pick(p.cast) }));
  const have = force ? new Set<string>() : await existing();
  const todo = assigned.filter((p) => (!only || p.slug === only) && !have.has(previewPath(p.slug))).slice(0, limit);

  const results: { slug: string; ok: boolean; voice?: string; detail?: string }[] = [];
  for (const p of todo) {
    if (!p.voice) { results.push({ slug: p.slug, ok: false, detail: "no matching voice" }); continue; }
    let audio: Buffer;
    try {
      const out = await synthesize(p.text, p.voice.voice_id, { format: "mp3_44100_128", model, voiceSettings: voiceSettingsFor(p.cast) });
      if (!out) throw new Error("no audio");
      audio = out.audio;
    } catch (err) {
      results.push({ slug: p.slug, ok: false, voice: p.voice.name, detail: `ElevenLabs: ${err instanceof Error ? err.message : String(err)}` });
      if (String(err).includes("401") || String(err).includes("quota")) break;
      continue;
    }
    const up = await db.storage.from(PREVIEW_BUCKET).upload(previewPath(p.slug), audio, { contentType: "audio/mpeg", upsert: true, cacheControl: "604800" });
    results.push({ slug: p.slug, ok: !up.error, voice: p.voice.name, detail: up.error?.message });
  }
  return NextResponse.json({ model, rendered: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results });
}
