"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Prank } from "@/lib/prankCategories";
import { canUse, categories } from "@/lib/prankCategories";
import { PrankArt } from "@/components/PrankArt";
import { TierBadge } from "@/components/PrankCard";
import { PersonFace } from "@/components/PersonFace";
import { playPreview, stopPreview } from "@/lib/previewAudio";
import { FRIEND_COUNTRIES, formatAsTyped, formatNumber, normalizeNumber, type FriendCountry } from "@/lib/phone";
import {
  TRACK_STEPS, WIZARD_STEPS, creditsUsed, firstBlockingStep, isFinal, stepProblem, trackProgress,
  type WizardState, type WizardStep,
} from "@/lib/callSteps";

type Call = { id: string; character_id: string; scenario_id?: string | null; status: string; turns: number; created_at: string; to: string | null; hasRecording: boolean };

const STATUS: Record<string, { label: string; tone: string }> = {
  awaiting_consent: { label: "Waiting for their YES", tone: "bg-volt" },
  calling: { label: "Ringing…", tone: "bg-ice text-white" },
  in_progress: { label: "On the call now", tone: "bg-go text-white" },
  completed: { label: "Done", tone: "bg-ink text-paper" },
  declined: { label: "They said no", tone: "bg-panel" },
  expired: { label: "Expired (no reply)", tone: "bg-panel" },
  no_answer: { label: "Didn't pick up · refunded", tone: "bg-panel" },
  failed: { label: "Failed · refunded", tone: "bg-nope text-white" },
  blocked: { label: "Blocked", tone: "bg-panel" },
};

const input = "mt-2 h-12 w-full rounded-full border-[2.5px] border-ink bg-paper px-4 font-semibold outline-none focus:bg-white";

export function CallStudio({ pranks, initialSlug, plan, credits: initialCredits, cost: CALL_COST = 3 }: { pranks: Prank[]; initialSlug?: string; plan: string; credits: number; cost?: number }) {
  const firstUsable = pranks.find((p) => canUse(plan, p.tier)) ?? pranks[0];
  const [slug, setSlug] = useState(initialSlug ?? firstUsable.slug);
  const prank = pranks.find((p) => p.slug === slug) ?? firstUsable;
  const [step, setStep] = useState<WizardStep>(initialSlug ? "friend" : "prank");
  const [q, setQ] = useState("");
  const [playing, setPlaying] = useState(false);
  const [country, setCountry] = useState<FriendCountry>("US");
  const [phone, setPhone] = useState("");
  const [touched, setTouched] = useState(false);
  const [callerNumbers, setCallerNumbers] = useState<string[]>([]);
  const [callerNumber, setCallerNumber] = useState("");
  const [senderName, setSenderName] = useState("");
  const [consent, setConsent] = useState(false);
  const [credits, setCredits] = useState(initialCredits);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [directIds, setDirectIds] = useState<string[]>([]);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch("/api/calls", { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    setCalls(data.calls);
    if (typeof data.credits === "number") setCredits(data.credits);
    if (typeof data.inviteUrl === "string") setInviteUrl(data.inviteUrl);
    const numbers = Array.isArray(data.callerNumbers) ? (data.callerNumbers as string[]) : [];
    setCallerNumbers(numbers);
    setCallerNumber((current) => (current && numbers.includes(current) ? current : numbers.length === 1 ? numbers[0] : ""));
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => stopPreview(), []);

  const tracked = trackId ? calls.find((c) => c.id === trackId) : undefined;
  useEffect(() => {
    const recent = (c: Call) => Date.now() - new Date(c.created_at).getTime() < 30 * 60_000;
    // Keep polling while a call is in flight, and briefly after it ends until the recording lands.
    const live = calls.some((c) => !isFinal(c.status) || (c.status === "completed" && !c.hasRecording && recent(c)));
    if (!live) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [calls, load]);

  const state: WizardState = {
    prankUsable: canUse(plan, prank.tier), friendNumber: phone, callerNumber, callerNumbers, senderName, consent, credits, cost: CALL_COST,
  };
  const idx = WIZARD_STEPS.findIndex((s) => s.id === step);
  const problem = stepProblem(step, state);

  function go(to: WizardStep) {
    // Only allow jumping forward past steps that are complete.
    const target = WIZARD_STEPS.findIndex((s) => s.id === to);
    for (let i = 0; i < target; i++) if (stepProblem(WIZARD_STEPS[i].id, state)) return setStep(WIZARD_STEPS[i].id);
    setError(null);
    setStep(to);
  }
  const next = () => { setTouched(true); if (!problem) go(WIZARD_STEPS[idx + 1].id); };
  const back = () => { setError(null); setStep(WIZARD_STEPS[Math.max(0, idx - 1)].id); };

  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return pranks.filter((p) => words.every((w) => `${p.title} ${p.blurb}`.toLowerCase().includes(w)));
  }, [pranks, q]);

  async function send() {
    const blocking = firstBlockingStep(state);
    if (blocking) return setStep(blocking);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName: senderName.trim(), phone: normalizeNumber(phone), callerNumber, characterId: prank.characterId, scenarioId: prank.scenarioId, senderAttests: consent }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.message ?? "Couldn't send that. Try again.");
        if (d.error === "bad_number" || d.error === "blocked" || d.error === "recipient_cap" || d.error === "pending") setStep("friend");
        if (d.error === "bad_caller_number") setStep("caller");
        return;
      }
      setTrackId(d.id);
      if (d.direct) setDirectIds((ids) => [...ids, d.id]);
      await load();
    } catch {
      setError("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function startOver(keepFriend: boolean) {
    setTrackId(null);
    setError(null);
    setConsent(false);
    if (!keepFriend) setPhone("");
    setTouched(false);
    setStep("prank");
  }

  const titleFor = (c: Call) => pranks.find((p) => p.characterId === c.character_id && p.scenarioId === c.scenario_id) ?? pranks.find((p) => p.characterId === c.character_id);
  const e164 = normalizeNumber(phone);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_360px]">
      <div className="sticker rounded-3xl bg-panel p-5 md:p-6">
        {trackId ? (
          <Tracker call={tracked} prank={prank} cost={CALL_COST} credits={credits} callerNumber={callerNumber} direct={!!trackId && directIds.includes(trackId)} onAgain={startOver} />
        ) : (
          <>
            {/* Stepper */}
            <ol className="mb-6 flex gap-1.5 overflow-x-auto pb-1" aria-label="Steps">
              {WIZARD_STEPS.map((s, i) => {
                const done = i < idx && !stepProblem(s.id, state);
                const current = s.id === step;
                return (
                  <li key={s.id} className="shrink-0">
                    <button type="button" onClick={() => go(s.id)} aria-current={current ? "step" : undefined}
                      className={`flex items-center gap-1.5 rounded-full border-2 px-3 py-1.5 text-xs font-extrabold ${current ? "border-ink bg-volt" : done ? "border-ink bg-white" : "border-ink/20 bg-white/60 text-ink/50"}`}>
                      <span className={`grid h-5 w-5 place-items-center rounded-full text-[11px] ${done ? "bg-go text-white" : current ? "bg-ink text-volt" : "bg-ink/10"}`}>{done ? "✓" : i + 1}</span>
                      {s.label}
                    </button>
                  </li>
                );
              })}
            </ol>

            {step === "prank" && (
              <div className="rise">
                <h2 className="text-2xl">Which prank?</h2>
                <div className="sticker-sm mt-4 grid overflow-hidden rounded-2xl sm:grid-cols-[180px_1fr]">
                  <PrankArt prank={prank} size="sm" />
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-xl leading-tight">{prank.title}</h3>
                      <TierBadge tier={prank.tier} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink/75">{prank.blurb}</p>
                    <p className="mt-2 text-sm font-bold italic text-ink/80">&ldquo;{prank.opener}&rdquo;</p>
                    <button type="button" className="sticker-sm press mt-3 rounded-full bg-panel px-3 py-1.5 text-sm font-extrabold"
                      onClick={() => { if (playing) { stopPreview(); setPlaying(false); } else { setPlaying(true); playPreview(prank.slug, prank.opener, { onEnd: () => setPlaying(false) }); } }}>
                      {playing ? "■ Stop" : "▶ Hear the opener"}
                    </button>
                  </div>
                </div>
                {!canUse(plan, prank.tier) && (
                  <p className="sticker-sm mt-3 rounded-2xl bg-volt p-3 text-sm font-bold">
                    This one&apos;s on {prank.tier === "pro" ? "Pro" : "Plus"}. <Link href="/pricing" className="underline">Upgrade</Link> or pick another below.
                  </p>
                )}
                <div className="mt-4 rounded-2xl border-[2.5px] border-ink bg-paper p-3">
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pranks…" aria-label="Search pranks" className="h-11 w-full rounded-full border-[2.5px] border-ink bg-white px-4 font-semibold outline-none" />
                  <div className="mt-3 max-h-72 space-y-4 overflow-y-auto pr-1">
                    {categories.map((c) => {
                      const list = matches.filter((p) => p.category === c.id);
                      if (!list.length) return null;
                      return (
                        <div key={c.id}>
                          <p className="label mb-1.5 flex items-center gap-1.5">
                            <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-ink" style={{ background: c.color }} />{c.label}
                          </p>
                          <div className="grid gap-1.5 sm:grid-cols-2">
                            {list.map((p) => {
                              const ok = canUse(plan, p.tier);
                              return (
                                <button key={p.slug} type="button"
                                  onClick={() => { stopPreview(); setPlaying(false); setSlug(p.slug); }}
                                  className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-sm font-bold ${p.slug === slug ? "border-ink bg-volt" : "border-ink/20 bg-white hover:border-ink"} ${ok ? "" : "opacity-60"}`}>
                                  <span className="text-lg" aria-hidden>{p.icon}</span>
                                  <span className="flex-1 leading-tight">{p.title}</span>
                                  {!ok && <span className="text-[10px] font-extrabold uppercase">🔒 {p.tier}</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {!matches.length && <p className="text-sm font-bold">No matches.</p>}
                  </div>
                </div>
              </div>
            )}

            {step === "friend" && (
              <div className="rise">
                <h2 className="text-2xl">Friend Number</h2>
                <p className="mt-1 font-semibold text-ink/70">The number that gets the prank. The first time, they get a text and reply YES once. After that, your pranks ring them directly.</p>
                <div className="mt-4 grid gap-3 sm:grid-cols-[170px_1fr]">
                  <label className="block">
                    <span className="label">Country</span>
                    <select value={country} onChange={(e) => setCountry(e.target.value as FriendCountry)} className={input}>
                      {FRIEND_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name} {c.dial}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Mobile number</span>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-4 top-1/2 mt-1 -translate-y-1/2 font-extrabold text-ink/60">+1</span>
                      <input type="tel" inputMode="tel" autoComplete="off" value={phone} autoFocus
                        onChange={(e) => setPhone(formatAsTyped(e.target.value))} onBlur={() => setTouched(true)}
                        placeholder="(555) 123-4567" aria-invalid={touched && !!problem} className={`${input} pl-11`} />
                    </div>
                  </label>
                </div>
                {touched && problem ? <p className="mt-2 text-sm font-bold text-nope">{problem}</p>
                  : e164 ? <p className="mt-2 text-sm font-bold text-go">✓ {formatNumber(e164)} looks good</p> : null}
                <p className="mt-3 text-xs font-semibold text-ink/60">Only US and Canadian numbers can be called right now. No toll-free, premium or emergency numbers.</p>
                {inviteUrl && (
                  <div className="mt-4 rounded-2xl border-2 border-dashed border-ink/30 p-3">
                    <p className="text-sm font-extrabold">Want it to ring with no heads-up text?</p>
                    <p className="mt-1 text-xs font-semibold text-ink/70">Send your friend your invite link from your own phone. Once they opt in (one text, one time), every prank you send rings them right away. If they&apos;ve said YES to you before, it already will.</p>
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(inviteUrl).then(() => setCopied(true), () => setCopied(false)); }}
                      className="sticker-sm press mt-2 rounded-full bg-panel px-3 py-1.5 text-xs font-extrabold">
                      {copied ? "✓ Copied" : "🔗 Copy invite link"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {step === "caller" && (
              <div className="rise">
                <h2 className="text-2xl">Prank Caller Number</h2>
                <p className="mt-1 font-semibold text-ink/70">The number your friend sees calling. These are RingRiot&apos;s own phone lines, so every one can actually place the call.</p>
                {!loaded ? <p className="mt-4 font-bold">Loading numbers…</p>
                  : callerNumbers.length === 0 ? <p className="sticker-sm mt-4 rounded-2xl bg-volt p-3 font-bold">No caller numbers are set up yet, so calls can&apos;t be sent right now.</p>
                  : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Prank Caller Number">
                      {callerNumbers.map((n) => (
                        <button key={n} type="button" role="radio" aria-checked={callerNumber === n} onClick={() => setCallerNumber(n)}
                          className={`sticker-sm press rounded-2xl p-4 text-left ${callerNumber === n ? "bg-volt" : "bg-white"}`}>
                          <span className="block text-xl font-extrabold">📞 {formatNumber(n)}</span>
                          <span className="mt-1 block text-xs font-bold text-ink/60">RingRiot line · area code {n.slice(2, 5)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                <p className="mt-3 text-xs font-semibold text-ink/60">You can&apos;t enter a custom caller ID. Showing someone else&apos;s number isn&apos;t allowed.</p>
              </div>
            )}

            {step === "details" && (
              <div className="rise space-y-4">
                <h2 className="text-2xl">Last details</h2>
                <label className="block">
                  <span className="label">Your name (your friend will see it in the text)</span>
                  <input required maxLength={30} value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Anthony" className={input} />
                </label>
                <label className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-ink/30 p-3">
                  <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-[#17121a]" />
                  <span className="text-sm font-semibold">
                    This is my friend, they&apos;re 13 or older, it&apos;s their number, and they&apos;ve agreed to get prank calls from me. I&apos;m responsible for this call under the <Link href="/legal/terms" className="underline">Terms</Link>. The call says up front that it&apos;s AI and recorded.
                  </span>
                </label>
                {touched && problem && <p className="text-sm font-bold text-nope">{problem}</p>}
              </div>
            )}

            {step === "review" && (
              <div className="rise">
                <h2 className="text-2xl">Check it over</h2>
                <dl className="mt-4 divide-y-2 divide-ink/10 rounded-2xl border-[2.5px] border-ink bg-white">
                  {[
                    ["Prank", prank.title, "prank"],
                    ["Friend Number", e164 ? formatNumber(e164) : "—", "friend"],
                    ["Prank Caller Number", callerNumber ? formatNumber(callerNumber) : "—", "caller"],
                    ["From", senderName.trim() || "—", "details"],
                  ].map(([k, v, s]) => (
                    <div key={k} className="flex items-center justify-between gap-3 px-4 py-3">
                      <dt className="label">{k}</dt>
                      <dd className="flex items-center gap-3 text-right font-extrabold">{v}
                        <button type="button" onClick={() => setStep(s as WizardStep)} className="text-xs font-bold underline">Edit</button>
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3 px-4 py-3">
                    <dt className="label">Cost</dt>
                    <dd className="text-right font-extrabold">{CALL_COST} credits <span className="block text-xs font-bold text-ink/60">You have {credits}. Refunded if they don&apos;t pick up. If they&apos;ve opted in before it rings right away; otherwise they get a YES text first.</span></dd>
                  </div>
                </dl>
                {problem && <p className="sticker-sm mt-3 rounded-2xl bg-volt p-3 text-sm font-bold">{problem} <Link href="/pricing" className="underline">Get credits</Link></p>}
              </div>
            )}

            {error && <p className="rise sticker-sm mt-4 rounded-2xl bg-volt p-3 text-sm font-bold">{error}</p>}

            <div className="mt-6 flex items-center gap-3">
              {idx > 0 && <button type="button" onClick={back} className="sticker-sm press rounded-full bg-panel px-5 py-3 font-extrabold">← Back</button>}
              {step !== "review" ? (
                <button type="button" onClick={next} disabled={step === "prank" && !!problem}
                  className="sticker press flex-1 rounded-full bg-ink py-3.5 text-lg font-extrabold text-volt disabled:opacity-50">
                  {step === "prank" && problem ? problem : "Next →"}
                </button>
              ) : (
                <button type="button" onClick={send} disabled={busy || !!firstBlockingStep(state)}
                  className="sticker press flex-1 rounded-full bg-ink py-3.5 text-lg font-extrabold text-volt disabled:opacity-50">
                  {busy ? "Sending…" : `📞 Send the prank`}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        <h2 className="text-2xl">Your calls</h2>
        <p className="text-sm font-bold text-ink/60">{credits} credits left · about {Math.floor(credits / CALL_COST)} calls</p>
        {!calls.length && <p className="sticker-sm rounded-2xl bg-panel p-4 text-sm font-semibold">No calls yet. Your calls and recordings show up here.</p>}
        {calls.map((c) => {
          const p = titleFor(c);
          const st = STATUS[c.status] ?? { label: c.status, tone: "bg-panel" };
          return (
            <button key={c.id} type="button" onClick={() => setTrackId(c.id)} className={`sticker-sm block w-full rounded-2xl p-3 text-left ${c.id === trackId ? "bg-volt/40" : "bg-panel"}`}>
              <div className="flex items-center gap-3">
                {p && <PersonFace look={p.look} size={40} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">{p?.title ?? "Prank call"} → {c.to ?? "friend"}</div>
                  <div className="text-xs font-semibold text-ink/60">{new Date(c.created_at).toLocaleString()}</div>
                </div>
                <span className={`sticker-sm shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${st.tone}`}>{st.label}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Tracker({ call, prank, cost, credits, callerNumber, direct, onAgain }: { call?: Call; prank: Prank; cost: number; credits: number; callerNumber: string; direct: boolean; onAgain: (keepFriend: boolean) => void }) {
  if (!call) return <p className="font-bold">Loading your call…</p>;
  const { reached, stoppedAt } = trackProgress(call.status);
  const final = isFinal(call.status);
  const used = creditsUsed(call.status, cost);
  return (
    <div className="rise">
      <div className="flex items-center gap-3">
        <PersonFace look={prank.look} size={52} />
        <div>
          <p className="label">{final ? "Call finished" : "Live status"}</p>
          <h2 className="text-2xl leading-tight">{prank.title} → {call.to ?? "your friend"}</h2>
          {callerNumber && <p className="text-xs font-bold text-ink/60">from {formatNumber(callerNumber)}</p>}
        </div>
      </div>
      <ol className="mt-6 space-y-3">
        {TRACK_STEPS.map((s, i) => {
          const done = i <= reached && !(stoppedAt && i > reached);
          const now = !final && i === reached + 1;
          return (
            <li key={s.id} className={`flex items-start gap-3 ${done || now ? "" : "opacity-40"}`}>
              <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 border-ink text-sm font-extrabold ${done ? "bg-go text-white" : now ? "bg-volt animate-pulse" : "bg-white"}`}>{done ? "✓" : i + 1}</span>
              <div>
                <p className="font-extrabold">{direct && i < 2 ? (i === 0 ? "No text needed" : "Already opted in") : s.label}{now && "…"}</p>
                <p className="text-sm font-semibold text-ink/60">{direct && i < 2 ? "They said YES to your pranks before." : s.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {stoppedAt && <p className="sticker-sm mt-4 rounded-2xl bg-volt p-3 font-bold">{stoppedAt}</p>}
      {final && (
        <div className="mt-5 rounded-2xl border-[2.5px] border-ink bg-white p-4">
          <p className="label">Result</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div><p className="display text-2xl">{call.turns}</p><p className="text-xs font-bold text-ink/60">back-and-forths</p></div>
            <div><p className="display text-2xl">{used}</p><p className="text-xs font-bold text-ink/60">credits used</p></div>
            <div><p className="display text-2xl">{credits}</p><p className="text-xs font-bold text-ink/60">credits left</p></div>
          </div>
          {call.hasRecording ? <audio controls preload="none" src={`/api/calls/${call.id}/recording`} className="mt-4 w-full" />
            : call.status === "completed" ? <p className="mt-3 text-sm font-semibold text-ink/60">The recording appears here a minute after the call ends.</p> : null}
        </div>
      )}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => onAgain(true)} className="sticker-sm press rounded-full bg-ink px-5 py-3 font-extrabold text-volt">Prank them again</button>
        <button type="button" onClick={() => onAgain(false)} className="sticker-sm press rounded-full bg-panel px-5 py-3 font-extrabold">New friend</button>
      </div>
    </div>
  );
}
