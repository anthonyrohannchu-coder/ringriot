"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PublicCharacter } from "@/lib/characters";
import { Waveform } from "./Waveform";

type Turn = { role: "user" | "character"; text: string };
type Mode = "demo" | "paid";

// ---------- Voice helpers (free, on-device) ----------
function pickVoice(prefer?: "male" | "female") {
  const voices = typeof window !== "undefined" ? window.speechSynthesis?.getVoices() ?? [] : [];
  const en = voices.filter((v) => v.lang.startsWith("en"));
  const femaleHints = /female|samantha|victoria|karen|moira|tessa|zira|aria|jenny|google us english/i;
  const maleHints = /male|daniel|alex|fred|david|guy|ryan|google uk english male/i;
  const hint = prefer === "female" ? femaleHints : prefer === "male" ? maleHints : null;
  return (hint && en.find((v) => hint.test(v.name))) || en[0] || voices[0];
}

export function DemoChat({
  characters,
  mode,
  initialCharacterId,
  premiumVoice = false,
}: {
  characters: PublicCharacter[];
  mode: Mode;
  initialCharacterId?: string;
  premiumVoice?: boolean;
}) {
  const [charId, setCharId] = useState(initialCharacterId ?? characters[0].id);
  const character = useMemo(() => characters.find((c) => c.id === charId)!, [characters, charId]);
  const [scenarioId, setScenarioId] = useState(character.scenarios[0].id);
  const scenario = character.scenarios.find((s) => s.id === scenarioId) ?? character.scenarios[0];

  const [turns, setTurns] = useState<Turn[]>([]);
  const [started, setStarted] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [clip, setClip] = useState<{ hook: string; caption: string } | null>(null);
  const requestId = useRef<string>("");
  const endRef = useRef<HTMLDivElement>(null);

  // Scroll only inside the chat box, and only once a conversation has started (never jump the page on load).
  useEffect(() => {
    const box = endRef.current?.parentElement;
    if (box && turns.length > 0) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);
  useEffect(() => {
    window.speechSynthesis?.getVoices(); // warm up voice list
  }, []);

  function reset(nextChar = charId) {
    window.speechSynthesis?.cancel();
    const c = characters.find((x) => x.id === nextChar)!;
    setCharId(nextChar);
    setScenarioId(c.scenarios[0].id);
    setTurns([]);
    setStarted(false);
    setError(null);
    setSessionId(null);
    setClip(null);
  }

  async function speak(text: string) {
    if (muted) return;
    setSpeaking(true);
    try {
      if (premiumVoice && mode === "paid") {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ characterId: character.id, text }),
        });
        if (r.ok) {
          const audio = new Audio(URL.createObjectURL(await r.blob()));
          audio.onended = () => setSpeaking(false);
          await audio.play();
          return;
        }
      }
      if (!("speechSynthesis" in window)) return setSpeaking(false);
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\*[^*]{1,30}\*/g, ""));
      u.voice = pickVoice(character.voice.browser.prefer) ?? null;
      u.pitch = character.voice.browser.pitch;
      u.rate = character.voice.browser.rate;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      setSpeaking(false);
    }
  }

  function start() {
    setStarted(true);
    requestId.current = crypto.randomUUID();
    const first: Turn = { role: "character", text: scenario.opener };
    setTurns([first]);
    speak(first.text);
  }

  async function send(text: string) {
    const clean = text.trim().slice(0, 500);
    if (!clean || busy) return;
    setError(null);
    setInput("");
    // History sent to the server excludes the opener (server re-adds it).
    const history = [...turns.slice(1), { role: "user" as const, text: clean }];
    setTurns((t) => [...t, { role: "user", text: clean }]);
    setBusy(true);
    try {
      const res = await fetch(mode === "demo" ? "/api/demo" : "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId: character.id,
          scenarioId: scenario.id,
          history,
          ...(mode === "paid" ? { requestId: requestId.current, sessionId: sessionId ?? undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({
          message: data.message ?? "Something went wrong. Try again.",
          upgrade: ["demo_limit", "upgrade_required", "no_credits", "daily_cap"].includes(data.error),
        });
        if (data.error === "unauthorized") setError({ message: "Log in to continue.", upgrade: true });
        return;
      }
      setProvider(data.provider);
      if (typeof data.remaining === "number") setRemaining(data.remaining);
      if (data.sessionId) setSessionId(data.sessionId);
      setTurns((t) => [...t, { role: "character", text: data.text }]);
      speak(data.text);
    } catch {
      setError({ message: "Network hiccup. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  function listen() {
    type SR = { lang: string; interimResults: boolean; onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void; onend: () => void; onerror: () => void; start: () => void };
    const W = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) return setError({ message: "Voice input isn't supported in this browser. Type instead." });
    window.speechSynthesis?.cancel();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.onresult = (e) => send(e.results[0][0].transcript);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    setListening(true);
    rec.start();
  }

  function makeClip() {
    const lines = turns.filter((t) => t.role === "character");
    const best = [...lines].sort((a, b) => b.text.length - a.text.length)[0]?.text ?? scenario.opener;
    setClip({
      hook: `POV: you let an AI ${character.archetype.replace(/^The /, "").toLowerCase()} talk to you`,
      caption: `"${best}" 💀 ${character.name} is unhinged. Made with AI characters (simulation). #ai #funny #comedy #prank`,
    });
  }

  const accent = character.accent;
  const locked = (c: PublicCharacter) => mode === "demo" && c.tier !== "free";

  return (
    <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
      {/* Picker */}
      <div className="space-y-4">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:grid-cols-2 lg:overflow-visible">
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => !locked(c) && reset(c.id)}
              className={`relative min-w-[132px] rounded-2xl border p-3 text-left transition active:scale-[.97] ${
                c.id === charId ? "border-white/70 bg-panel" : "border-line bg-panel/50 hover:border-white/30"
              } ${locked(c) ? "opacity-50" : ""}`}
              style={c.id === charId ? { boxShadow: `0 0 0 1px ${c.accent}55, 0 8px 30px -10px ${c.accent}88` } : undefined}
              aria-pressed={c.id === charId}
            >
              <div className="text-2xl">{c.emoji}</div>
              <div className="mt-1 text-sm font-bold leading-tight">{c.name}</div>
              <div className="text-[11px] leading-tight text-muted">{c.archetype.replace("The ", "")}</div>
              {locked(c) && <span className="label absolute right-2 top-2 text-[9px] text-volt">{c.tier}</span>}
            </button>
          ))}
        </div>
        <div>
          <p className="label mb-2 text-muted">Scenario</p>
          <div className="space-y-2">
            {character.scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => { setScenarioId(s.id); setTurns([]); setStarted(false); setSessionId(null); }}
                className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm ${s.id === scenario.id ? "border-white/60 bg-panel" : "border-line text-muted"}`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Call screen */}
      <div className="flex min-h-[520px] flex-col overflow-hidden rounded-3xl border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-full text-2xl" style={{ background: `${accent}22`, boxShadow: `0 0 24px -4px ${accent}` }}>
              {character.emoji}
            </div>
            <div>
              <div className="font-bold">{character.name}</div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Waveform active={speaking || busy} color={accent} />
                {busy ? "thinking…" : speaking ? "talking" : started ? "on the line" : "ready"}
              </div>
            </div>
          </div>
          <button onClick={() => { setMuted((m) => !m); window.speechSynthesis?.cancel(); }} className="rounded-full border border-line px-3 py-1.5 text-xs" aria-label={muted ? "Unmute" : "Mute"}>
            {muted ? "🔇 Muted" : "🔊 Sound on"}
          </button>
        </div>

        <div className="label border-b border-line bg-ink/60 px-4 py-2 text-[10px] text-ice">
          ◉ Browser simulation · not a real phone call
          {provider === "scripted" && <span className="ml-2 text-muted">· scripted lines (AI key not set)</span>}
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
          {!started && (
            <div className="grid h-full place-items-center text-center">
              <div>
                <p className="text-muted">{character.description}</p>
                <p className="mt-3 italic text-white/80">&ldquo;{character.exampleLine}&rdquo;</p>
                <button onClick={start} className="mt-6 rounded-full px-7 py-3.5 text-base font-bold text-ink active:scale-95" style={{ background: accent }}>
                  ▶ Start the bit
                </button>
                {mode === "paid" && <p className="mt-2 text-xs text-muted">Uses 1 credit when you send your first reply</p>}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={`rise flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[15px] leading-snug ${t.role === "user" ? "rounded-br-sm bg-white text-ink" : "rounded-bl-sm bg-ink"}`}
                style={t.role === "character" ? { border: `1px solid ${accent}44` } : undefined}
              >
                {t.text}
                {t.role === "character" && (
                  <button onClick={() => speak(t.text)} className="ml-2 align-middle text-xs text-muted hover:text-white" aria-label="Replay line">↻</button>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="rise text-sm text-muted">{character.name.split(" ")[0]} is typing…</div>}
          {error && (
            <div className="rise rounded-xl border border-hot/40 bg-hot/10 p-3 text-sm">
              {error.message}
              {error.upgrade && (
                <div className="mt-2 flex gap-2">
                  <Link href="/pricing" className="rounded-full bg-volt px-3 py-1.5 text-xs font-bold text-ink">See plans</Link>
                  {mode === "demo" && <Link href="/login" className="rounded-full border border-line px-3 py-1.5 text-xs">Sign up</Link>}
                </div>
              )}
            </div>
          )}
          {clip && (
            <div className="rise rounded-xl border border-volt/40 bg-volt/5 p-3 text-sm">
              <p className="label mb-1 text-volt">Clip kit</p>
              <p><b>Hook:</b> {clip.hook}</p>
              <p className="mt-1"><b>Caption:</b> {clip.caption}</p>
              <button onClick={() => navigator.clipboard?.writeText(`${clip.hook}\n\n${clip.caption}`)} className="mt-2 rounded-full border border-line px-3 py-1 text-xs">Copy</button>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {started && (
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t border-line p-3">
            <button type="button" onClick={listen} disabled={busy} className={`grid h-12 w-12 shrink-0 place-items-center rounded-full border ${listening ? "border-hot bg-hot/20" : "border-line"}`} aria-label="Talk">
              🎙
            </button>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={listening ? "Listening…" : "Say something back…"}
              maxLength={500}
              className="h-12 flex-1 rounded-full border border-line bg-ink px-4 text-[15px] outline-none focus:border-white/50"
            />
            <button disabled={busy || !input.trim()} className="h-12 rounded-full px-5 font-bold text-ink disabled:opacity-40" style={{ background: accent }}>
              Send
            </button>
          </form>
        )}
        {started && (
          <div className="flex items-center justify-between px-4 pb-3 text-xs text-muted">
            <span>{remaining !== null ? `${remaining} free replies left today` : " "}</span>
            <div className="flex gap-3">
              {turns.length > 2 && <button onClick={makeClip} className="hover:text-white">✂ Make clip kit</button>}
              <button onClick={() => reset()} className="hover:text-white">End call</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
