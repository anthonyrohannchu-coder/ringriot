"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { PublicCharacter } from "@/lib/characters";
import { PersonFace } from "./PersonFace";
import { Waveform } from "./Waveform";

type Turn = { role: "user" | "character"; text: string };
type Mode = "demo" | "paid";

const DECLINE_LINES = [
  "Declined?! Oh no. They're calling back.",
  "You declined AGAIN. They have your number memorized now.",
  "Third time. Honestly? Just pick up.",
];

function pickVoice(prefer?: "male" | "female") {
  const voices = typeof window !== "undefined" ? window.speechSynthesis?.getVoices() ?? [] : [];
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith("en"));
  const female = /female|samantha|victoria|karen|moira|tessa|zira|aria|jenny|emma|ava|allison|susan|serena|libby|sonia|michelle|google us english|google uk english female/i;
  const male = /\bmale|daniel|alex|fred|david|guy|ryan|tom|aaron|arthur|evan|nathan|christopher|eric|google uk english male/i;
  // Prefer the most natural-sounding voices the device has (neural/premium/enhanced/online), then Google voices.
  const quality = (v: SpeechSynthesisVoice) =>
    (/natural|neural|premium|enhanced|online/i.test(v.name) ? 4 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
  const gender = (v: SpeechSynthesisVoice) => (prefer === "female" ? female.test(v.name) && !/\bmale/i.test(v.name) : prefer === "male" ? male.test(v.name) : true);
  const ranked = [...en].sort((a, b) => Number(gender(b)) * 10 + quality(b) - (Number(gender(a)) * 10 + quality(a)));
  return ranked[0] || voices[0];
}

const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export function DemoChat({
  characters,
  mode,
  initialCharacterId,
  initialScenarioId,
  premiumVoice = false,
}: {
  characters: PublicCharacter[];
  mode: Mode;
  initialCharacterId?: string;
  initialScenarioId?: string;
  premiumVoice?: boolean;
}) {
  const [charId, setCharId] = useState(initialCharacterId ?? characters[0].id);
  const character = useMemo(() => characters.find((c) => c.id === charId)!, [characters, charId]);
  const [scenarioId, setScenarioId] = useState(
    initialScenarioId && character.scenarios.some((s) => s.id === initialScenarioId) ? initialScenarioId : character.scenarios[0].id,
  );
  const scenario = character.scenarios.find((s) => s.id === scenarioId) ?? character.scenarios[0];

  const [turns, setTurns] = useState<Turn[]>([]);
  const [started, setStarted] = useState(false);
  const [declines, setDeclines] = useState(0);
  const [declinedFlash, setDeclinedFlash] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<{ message: string; upgrade?: boolean } | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [provider, setProvider] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [spicy, setSpicy] = useState(false);
  const [ageAsk, setAgeAsk] = useState(false);
  const [clip, setClip] = useState<{ hook: string; caption: string } | null>(null);
  const requestId = useRef<string>("");
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = logRef.current;
    if (box && turns.length > 0) box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }, [turns, busy, error, clip]);

  useEffect(() => {
    window.speechSynthesis?.getVoices();
  }, []);

  useEffect(() => {
    if (!started) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [started]);

  function reset(nextChar = charId) {
    window.speechSynthesis?.cancel();
    const c = characters.find((x) => x.id === nextChar)!;
    setCharId(nextChar);
    setScenarioId(c.scenarios[0].id);
    setTurns([]);
    setStarted(false);
    setDeclines(0);
    setSeconds(0);
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
      const bv = scenario.browserVoice ?? character.voice.browser;
      u.voice = pickVoice(bv.prefer) ?? null;
      u.pitch = bv.pitch;
      u.rate = bv.rate;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      window.speechSynthesis.speak(u);
    } catch {
      setSpeaking(false);
    }
  }

  function accept() {
    setStarted(true);
    setSeconds(0);
    requestId.current = crypto.randomUUID();
    const opener =
      declines > 0 ? `Oh, NOW you pick up. ${scenario.opener}` : scenario.opener;
    setTurns([{ role: "character", text: opener }]);
    speak(opener);
  }

  function decline() {
    setDeclinedFlash(true);
    setDeclines((d) => d + 1);
    setTimeout(() => setDeclinedFlash(false), 1600);
  }

  async function send(text: string) {
    const clean = text.trim().slice(0, 500);
    if (!clean || busy) return;
    setError(null);
    setInput("");
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
          spicy,
          ...(mode === "paid" ? { requestId: requestId.current, sessionId: sessionId ?? undefined } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError({
          message: data.error === "unauthorized" ? "Log in to keep going." : data.message ?? "Something went wrong. Try again.",
          upgrade: ["demo_limit", "upgrade_required", "no_credits", "daily_cap", "unauthorized"].includes(data.error),
        });
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
    if (!Ctor) return setError({ message: "Voice input doesn't work in this browser. Type instead." });
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
      hook: `POV: you picked up a call from ${character.archetype.replace(/^The /, "the ").toLowerCase()}`,
      caption: `"${best}" 💀 ${character.name} has zero chill. (AI character, fake call) #funny #comedy #ai #prank`,
    });
  }

  const accent = character.accent;
  const locked = (c: PublicCharacter) => mode === "demo" && c.tier !== "free";
  const first = character.name.split(" ")[0].replace(".", "");

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
      {/* Character picker */}
      <div className="order-2 space-y-5 lg:order-1">
        <div>
          <p className="label mb-3">1 · Pick who calls</p>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 sm:grid sm:grid-cols-4 sm:overflow-visible">
            {characters.map((c) => {
              const active = c.id === charId;
              return (
                <button
                  key={c.id}
                  onClick={() => !locked(c) && reset(c.id)}
                  aria-pressed={active}
                  className={`sticker-sm relative min-w-[118px] rounded-2xl p-3 text-left transition ${active ? "-rotate-2 scale-[1.03]" : "press"} ${locked(c) ? "cursor-not-allowed opacity-60" : ""}`}
                  style={{ background: active ? c.accent : "#fff" }}
                >
                  {c.scenarios[0].look ? <PersonFace look={c.scenarios[0].look} size={48} /> : null}
                  <div className="mt-1 text-sm font-extrabold leading-tight">{c.name}</div>
                  <div className="text-[11px] font-medium leading-tight text-ink/70">{c.archetype.replace("The ", "")}</div>
                  {locked(c) && (
                    <span className="sticker-sm absolute -right-2 -top-2 rotate-6 rounded-full bg-volt px-2 py-0.5 text-[10px] font-extrabold uppercase">
                      🔒 {c.tier}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="label mb-3">2 · Pick the situation</p>
          <div className="flex flex-wrap gap-2">
            {character.scenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => { setScenarioId(s.id); setTurns([]); setStarted(false); setSessionId(null); setDeclines(0); }}
                className={`sticker-sm rounded-full px-4 py-2 text-sm font-bold ${s.id === scenario.id ? "bg-ink text-paper" : "press bg-panel"}`}
              >
                {s.title}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="label mb-3">3 · Pick the vibe</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => { setSpicy(false); setAgeAsk(false); }}
              className={`sticker-sm rounded-full px-4 py-2 text-sm font-bold ${!spicy ? "bg-ink text-paper" : "press bg-panel"}`}
            >
              😇 Clean
            </button>
            <button
              onClick={() => (spicy ? null : setAgeAsk(true))}
              className={`sticker-sm rounded-full px-4 py-2 text-sm font-bold ${spicy ? "bg-nope text-white" : "press bg-panel"}`}
            >
              🌶 Spicy (18+)
            </button>
          </div>
          {ageAsk && !spicy && (
            <div className="rise sticker-sm mt-3 rounded-2xl bg-volt p-3 text-sm font-semibold">
              Spicy mode swears and roasts you. You need to be 18+.
              <div className="mt-2 flex gap-2">
                <button onClick={() => { setSpicy(true); setAgeAsk(false); }} className="sticker-sm press rounded-full bg-nope px-3 py-1 text-xs font-extrabold text-white">I'm 18+, turn it on</button>
                <button onClick={() => setAgeAsk(false)} className="sticker-sm press rounded-full bg-panel px-3 py-1 text-xs font-extrabold">Nah</button>
              </div>
            </div>
          )}
        </div>
        <div className="sticker tilt-l hidden rounded-2xl bg-panel p-4 lg:block">
          <p className="label text-hot">Sample line</p>
          <p className="mt-1 text-lg font-bold">&ldquo;{character.exampleLine}&rdquo;</p>
          <p className="mt-1 text-sm text-muted">— {character.name}</p>
        </div>
      </div>

      {/* Phone */}
      <div className="order-1 mx-auto w-full max-w-[400px] lg:order-2">
        <div className="sticker rounded-[46px] bg-ink p-2.5">
          <div className="relative flex h-[600px] flex-col overflow-hidden rounded-[38px] bg-paper">
            <div className="absolute left-1/2 top-2 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" aria-hidden />

            {!started ? (
              /* Incoming call screen */
              <div className="flex h-full flex-col items-center justify-between px-6 pb-10 pt-14 text-center" style={{ background: `linear-gradient(180deg, ${accent} 0%, #fff8e1 85%)` }}>
                <div>
                  <p className="label">{declines ? "calling again…" : "incoming call…"}</p>
                  <div className="ring mx-auto mt-6 w-fit">
                    {scenario.look && <PersonFace look={scenario.look} size={150} />}
                  </div>
                  <h3 className="mt-4 text-3xl leading-none">{character.name}</h3>
                  <p className="mt-2 font-semibold text-ink/70">{scenario.title}</p>
                  <p className="sticker-sm mx-auto mt-4 w-fit rounded-full bg-panel px-3 py-1 text-[11px] font-bold">◉ Browser simulation · not a real call</p>
                  {declinedFlash && <p className="rise mt-4 font-extrabold">{DECLINE_LINES[Math.min(declines - 1, 2)]}</p>}
                </div>
                <div className="flex w-full items-end justify-around">
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={decline} aria-label="Decline" className="sticker press grid h-[72px] w-[72px] place-items-center rounded-full bg-nope text-3xl text-white">
                      <span className="rotate-[135deg]">☎</span>
                    </button>
                    <span className="text-sm font-bold">Decline</span>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={accept} aria-label="Accept" className="sticker press pulse-ring grid h-[72px] w-[72px] place-items-center rounded-full bg-go text-3xl text-white">
                      ☎
                    </button>
                    <span className="text-sm font-bold">Accept</span>
                  </div>
                </div>
              </div>
            ) : (
              /* In-call screen */
              <>
                <div className="flex items-center justify-between gap-2 border-b-[3px] border-ink px-4 pb-3 pt-10" style={{ background: accent }}>
                  <div className="flex items-center gap-2.5">
                    {scenario.look && <PersonFace look={scenario.look} size={46} talking={speaking} />}
                    <div>
                      <div className="font-extrabold leading-tight">{character.name}</div>
                      <div className="flex items-center gap-1.5 text-xs font-bold">
                        <Waveform active={speaking || busy} color="#17121a" />
                        {busy ? "thinking…" : speaking ? "talking" : fmt(seconds)}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => { setMuted((m) => !m); window.speechSynthesis?.cancel(); }} className="sticker-sm rounded-full bg-panel px-3 py-1 text-xs font-bold" aria-label={muted ? "Unmute" : "Mute"}>
                    {muted ? "🔇" : "🔊"}
                  </button>
                </div>
                <div className="border-b-2 border-ink/15 bg-panel px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-ink/60">
                  ◉ Simulation · not a real phone call{spicy && <span className="text-nope"> · 🌶 spicy</span>}
                  {provider === "scripted" && <span> · scripted lines</span>}
                </div>

                <div ref={logRef} className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                  {turns.map((t, i) => (
                    <div key={i} className={`rise flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`sticker-sm max-w-[85%] px-3.5 py-2 text-[15px] font-medium leading-snug ${t.role === "user" ? "rounded-2xl rounded-br-md bg-ice text-white" : "rounded-2xl rounded-bl-md bg-panel"}`}
                      >
                        {t.text}
                        {t.role === "character" && (
                          <button onClick={() => speak(t.text)} className="ml-1.5 align-middle text-xs text-ink/50 hover:text-ink" aria-label="Replay line">↻</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {busy && <div className="rise text-sm font-bold text-ink/60">{first} is typing…</div>}
                  {error && (
                    <div className="rise sticker-sm rounded-2xl bg-volt p-3 text-sm font-semibold">
                      {error.message}
                      {error.upgrade && (
                        <div className="mt-2 flex gap-2">
                          <Link href="/pricing" className="sticker-sm rounded-full bg-hot px-3 py-1 text-xs font-extrabold">See plans</Link>
                          {mode === "demo" && <Link href="/login" className="sticker-sm rounded-full bg-panel px-3 py-1 text-xs font-extrabold">Sign up</Link>}
                        </div>
                      )}
                    </div>
                  )}
                  {clip && (
                    <div className="rise sticker-sm rounded-2xl bg-hot p-3 text-sm">
                      <p className="label">✂ Clip kit</p>
                      <p className="mt-1"><b>Hook:</b> {clip.hook}</p>
                      <p className="mt-1"><b>Caption:</b> {clip.caption}</p>
                      <button
                        onClick={(e) => {
                          const btn = e.currentTarget;
                          navigator.clipboard?.writeText(`${clip.hook}\n\n${clip.caption}`).then(() => (btn.textContent = "Copied!"), () => (btn.textContent = "Select & copy above"));
                        }}
                        className="sticker-sm mt-2 rounded-full bg-panel px-3 py-1 text-xs font-extrabold"
                      >
                        Copy
                      </button>
                    </div>
                  )}
                </div>

                <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 border-t-[3px] border-ink bg-panel p-2.5">
                  <button type="button" onClick={listen} disabled={busy} className={`sticker-sm grid h-11 w-11 shrink-0 place-items-center rounded-full ${listening ? "bg-hot" : "bg-paper"}`} aria-label="Talk with your mic">
                    🎙
                  </button>
                  <input
                    id="demo-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={listening ? "Listening…" : `Say something to ${first}…`}
                    maxLength={500}
                    className="h-11 min-w-0 flex-1 rounded-full border-[2.5px] border-ink bg-paper px-4 text-[15px] font-medium outline-none focus:bg-white"
                  />
                  <button disabled={busy || !input.trim()} className="sticker-sm h-11 rounded-full bg-volt px-4 font-extrabold disabled:opacity-40">
                    Send
                  </button>
                </form>
                <div className="flex items-center justify-between bg-panel px-4 pb-3 text-xs font-bold">
                  <span className="text-ink/60">{remaining !== null ? `${remaining} free replies left today` : mode === "paid" ? "1 credit per call" : " "}</span>
                  <div className="flex gap-3">
                    {turns.length > 2 && <button onClick={makeClip} className="underline decoration-2 underline-offset-2">✂ Clip it</button>}
                    <button onClick={() => reset()} className="text-nope underline decoration-2 underline-offset-2">Hang up</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
