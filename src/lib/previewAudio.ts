"use client";
// Plays a prank's pre-recorded preview (human ElevenLabs voice). If the clip isn't there yet,
// falls back to the device's own speech voice so Preview always does something.
import { previewText, previewUrl } from "@/lib/previewVoices";

type BrowserVoice = { pitch: number; rate: number; prefer?: "male" | "female" };
let current: HTMLAudioElement | null = null;

export function stopPreview() {
  current?.pause();
  current = null;
  if (typeof window !== "undefined") window.speechSynthesis?.cancel();
}

function speakFallback(text: string, bv?: BrowserVoice, onEnd?: () => void) {
  const s = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!s) return onEnd?.();
  s.cancel();
  const u = new SpeechSynthesisUtterance(previewText(text));
  if (bv) {
    u.pitch = bv.pitch;
    u.rate = bv.rate;
    const voices = s.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
    const female = /female|samantha|victoria|karen|zira|aria|jenny|emma|ava|allison|susan/i;
    u.voice = voices.find((v) => (bv.prefer === "female" ? female.test(v.name) : !female.test(v.name))) ?? null;
  }
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  s.speak(u);
}

/** Play the preview for `slug`; calls onEnd when finished (or on failure). */
export function playPreview(slug: string, text: string, opts: { browserVoice?: BrowserVoice; onEnd?: () => void } = {}) {
  stopPreview();
  const url = previewUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, slug);
  if (!url) return speakFallback(text, opts.browserVoice, opts.onEnd);
  const a = new Audio(url);
  current = a;
  let fellBack = false;
  const fallback = () => {
    if (fellBack || current !== a) return;
    fellBack = true;
    current = null;
    speakFallback(text, opts.browserVoice, opts.onEnd);
  };
  a.onended = () => { if (current === a) current = null; opts.onEnd?.(); };
  a.onerror = fallback;
  a.play().catch(fallback);
}
