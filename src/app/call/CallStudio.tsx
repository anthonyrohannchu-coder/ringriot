"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Prank } from "@/lib/prankCategories";
import { canUse, categories } from "@/lib/prankCategories";
import { PrankArt } from "@/components/PrankArt";
import { TierBadge } from "@/components/PrankCard";
import { CharacterFace } from "@/components/CharacterFace";

type Call = { id: string; character_id: string; status: string; turns: number; created_at: string; to: string | null; hasRecording: boolean };

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

export function CallStudio({ pranks, initialSlug, plan, credits, cost: CALL_COST = 3 }: { pranks: Prank[]; initialSlug?: string; plan: string; credits: number; cost?: number }) {
  const firstUsable = pranks.find((p) => canUse(plan, p.tier)) ?? pranks[0];
  const [slug, setSlug] = useState(initialSlug ?? firstUsable.slug);
  const prank = pranks.find((p) => p.slug === slug) ?? firstUsable;
  const locked = !canUse(plan, prank.tier);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [senderName, setSenderName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [callerNumbers, setCallerNumbers] = useState<string[]>([]);
  const [callerNumber, setCallerNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/calls");
    if (r.ok) {
      const data = await r.json();
      setCalls(data.calls);
      const numbers = Array.isArray(data.callerNumbers) ? (data.callerNumbers as string[]) : [];
      setCallerNumbers(numbers);
      setCallerNumber((current) => (current && numbers.includes(current) ? current : numbers[0] ?? ""));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const live = calls.some((c) => ["awaiting_consent", "calling", "in_progress"].includes(c.status));
    if (!live) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [calls, load]);

  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return pranks.filter((p) => words.every((w) => `${p.title} ${p.blurb}`.toLowerCase().includes(w)));
  }, [pranks, q]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (locked || !consent) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName, phone, callerNumber, characterId: prank.characterId, scenarioId: prank.scenarioId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ text: d.message ?? "Couldn't send that. Try again.", ok: false });
      else {
        setMsg({ text: "Text sent! When your friend replies YES, their phone rings.", ok: true });
        setPhone("");
        setConsent(false);
        load();
      }
    } catch {
      setMsg({ text: "Network error. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  const titleFor = (c: Call) => pranks.find((p) => p.characterId === c.character_id);
  const disabledReason =
    locked ? `This prank is on ${prank.tier === "pro" ? "Pro" : "Plus"}`
    : credits < CALL_COST ? `You need ${CALL_COST} credits`
    : callerNumbers.length === 0 ? "No caller number set up yet"
    : null;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} className="sticker space-y-6 rounded-3xl bg-panel p-6">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <p className="label">1 · The prank</p>
            <button type="button" onClick={() => setPicking((v) => !v)} className="text-sm font-extrabold underline decoration-[3px] underline-offset-4" aria-expanded={picking}>
              {picking ? "Done" : "Change prank"}
            </button>
          </div>
          <div className="sticker-sm grid overflow-hidden rounded-2xl sm:grid-cols-[180px_1fr]">
            <PrankArt prank={prank} size="sm" />
            <div className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-xl leading-tight">{prank.title}</h2>
                <TierBadge tier={prank.tier} />
              </div>
              <p className="mt-1 text-sm font-medium text-ink/75">{prank.blurb}</p>
              <p className="mt-2 text-sm font-bold italic text-ink/80">Opens with: &ldquo;{prank.opener}&rdquo;</p>
            </div>
          </div>
          {locked && (
            <p className="sticker-sm mt-3 rounded-2xl bg-volt p-3 text-sm font-bold">
              This one&apos;s on {prank.tier === "pro" ? "Pro" : "Plus"}. <Link href="/pricing" className="underline">Upgrade</Link> or pick another prank.
            </p>
          )}
          {picking && (
            <div className="rise mt-3 rounded-2xl border-[2.5px] border-ink bg-paper p-3">
              <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search pranks…" aria-label="Search pranks" className="h-11 w-full rounded-full border-[2.5px] border-ink bg-white px-4 font-semibold outline-none" />
              <div className="mt-3 max-h-80 space-y-4 overflow-y-auto pr-1">
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
                            <button key={p.slug} type="button" disabled={!ok}
                              onClick={() => { setSlug(p.slug); setPicking(false); setMsg(null); }}
                              className={`flex items-center gap-2 rounded-xl border-2 px-2.5 py-2 text-left text-sm font-bold ${p.slug === slug ? "border-ink bg-volt" : "border-ink/20 bg-white hover:border-ink"} ${ok ? "" : "opacity-50"}`}>
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
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">2 · Your name (they&apos;ll see it)</span>
            <input id="sender" required maxLength={30} value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Anthony" className={input} />
          </label>
          <label className="block">
            <span className="label">3 · Friend Number</span>
            <input id="phone" required type="tel" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" className={input} />
          </label>
        </div>
        <label className="block">
          <span className="label">4 · Prank Caller Number</span>
          <select value={callerNumber} onChange={(e) => setCallerNumber(e.target.value)} disabled={callerNumbers.length === 0} required className={`${input} disabled:opacity-60`}>
            {callerNumbers.length === 0
              ? <option value="">No caller numbers configured yet</option>
              : callerNumbers.map((number) => <option key={number} value={number}>{number}</option>)}
          </select>
          <span className="mt-1 block text-xs font-semibold text-ink/60">The number your friend sees calling. Only RingRiot&apos;s own numbers appear here.</span>
        </label>

        <label className="flex items-start gap-3 rounded-2xl border-2 border-dashed border-ink/30 p-3">
          <input type="checkbox" required checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5 accent-[#17121a]" />
          <span className="text-sm font-semibold">
            This is my friend, they&apos;re 13 or older, and they&apos;d be OK with a prank call. I understand they&apos;ll be asked to reply YES first.
          </span>
        </label>

        <button disabled={busy || !!disabledReason || !consent} className="sticker press w-full rounded-full bg-ink py-4 text-lg font-extrabold text-volt disabled:opacity-50">
          {busy ? "Sending…" : disabledReason ?? `📞 Send “${prank.title}” · ${CALL_COST} credits`}
        </button>
        {msg && <p className={`rise sticker-sm rounded-2xl p-3 text-sm font-bold ${msg.ok ? "bg-go text-white" : "bg-volt"}`}>{msg.text}</p>}
        <p className="text-xs font-semibold text-ink/60">
          Your friend gets a text first and the phone only rings if they reply YES. The call starts with a quick AI + recording notice.
          Credits come back if they don&apos;t pick up. US &amp; Canada mobiles only. They can reply STOP to block all calls.
        </p>
      </form>

      <div className="space-y-3">
        <h2 className="text-2xl">Your calls</h2>
        <p className="text-sm font-bold text-ink/60">{credits} credits left · about {Math.floor(credits / CALL_COST)} calls</p>
        {!calls.length && <p className="sticker-sm rounded-2xl bg-panel p-4 text-sm font-semibold">No calls yet. Send your first one and the recording shows up here.</p>}
        {calls.map((c) => {
          const p = titleFor(c);
          const st = STATUS[c.status] ?? { label: c.status, tone: "bg-panel" };
          return (
            <div key={c.id} className="sticker-sm rounded-2xl bg-panel p-3">
              <div className="flex items-center gap-3">
                {p && <CharacterFace id={p.characterId} color={p.accent} size={40} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">To {c.to ?? "friend"}</div>
                  <div className="text-xs font-semibold text-ink/60">{new Date(c.created_at).toLocaleString()}</div>
                </div>
                <span className={`sticker-sm shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${st.tone}`}>{st.label}</span>
              </div>
              {c.hasRecording && <audio controls preload="none" src={`/api/calls/${c.id}/recording`} className="mt-3 w-full" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
