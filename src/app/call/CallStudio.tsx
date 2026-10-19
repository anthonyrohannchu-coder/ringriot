"use client";

import { useCallback, useEffect, useState } from "react";
import type { PublicCharacter } from "@/lib/characters";
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

export function CallStudio({ characters, plan, credits }: { characters: PublicCharacter[]; plan: string; credits: number }) {
  const rank = { free: 0, plus: 1, pro: 2 } as Record<string, number>;
  const usable = characters.filter((c) => rank[c.tier] <= rank[plan]);
  const [charId, setCharId] = useState(usable[0]?.id ?? characters[0].id);
  const character = characters.find((c) => c.id === charId)!;
  const [scenarioId, setScenarioId] = useState(character.scenarios[0].id);
  const [senderName, setSenderName] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);

  const load = useCallback(async () => {
    const r = await fetch("/api/calls");
    if (r.ok) setCalls((await r.json()).calls);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const live = calls.some((c) => ["awaiting_consent", "calling", "in_progress"].includes(c.status));
    if (!live) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [calls, load]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/calls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderName, phone, characterId: charId, scenarioId }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ text: d.message ?? "Couldn't send that. Try again.", ok: false });
      else {
        setMsg({ text: "Text sent! When your friend replies YES, their phone rings.", ok: true });
        setPhone("");
        load();
      }
    } catch {
      setMsg({ text: "Network error. Try again.", ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_380px]">
      <form onSubmit={submit} className="sticker space-y-6 rounded-3xl bg-panel p-6">
        <div>
          <p className="label mb-3">1 · Who's calling</p>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-4 sm:overflow-visible">
            {characters.map((c) => {
              const locked = rank[c.tier] > rank[plan];
              const active = c.id === charId;
              return (
                <button
                  type="button"
                  key={c.id}
                  disabled={locked}
                  onClick={() => { setCharId(c.id); setScenarioId(c.scenarios[0].id); }}
                  aria-pressed={active}
                  className={`sticker-sm relative min-w-[110px] rounded-2xl p-2.5 text-left ${active ? "-rotate-2" : "press"} ${locked ? "opacity-50" : ""}`}
                  style={{ background: active ? c.accent : "#fff" }}
                >
                  <CharacterFace id={c.id} color={c.accent} size={52} />
                  <div className="mt-1 text-sm font-extrabold leading-tight">{c.name}</div>
                  {locked && <span className="text-[10px] font-extrabold uppercase">🔒 {c.tier}</span>}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <p className="label mb-3">2 · The bit</p>
          <div className="flex flex-wrap gap-2">
            {character.scenarios.map((s) => (
              <button type="button" key={s.id} onClick={() => setScenarioId(s.id)}
                className={`sticker-sm rounded-full px-4 py-2 text-sm font-bold ${s.id === scenarioId ? "bg-ink text-paper" : "press bg-panel"}`}>
                {s.title}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">3 · Your name (they'll see it)</span>
            <input id="sender" required maxLength={30} value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Anthony"
              className="mt-2 h-12 w-full rounded-full border-[2.5px] border-ink bg-paper px-4 font-semibold outline-none focus:bg-white" />
          </label>
          <label className="block">
            <span className="label">4 · Friend's mobile number</span>
            <input id="phone" required type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567"
              className="mt-2 h-12 w-full rounded-full border-[2.5px] border-ink bg-paper px-4 font-semibold outline-none focus:bg-white" />
          </label>
        </div>
        <button disabled={busy || credits < 3} className="sticker press w-full rounded-full bg-ink py-4 text-lg font-extrabold text-volt disabled:opacity-50">
          {busy ? "Sending…" : credits < 3 ? "You need 3 credits" : `📞 Send ${character.name}'s call · 3 credits`}
        </button>
        {msg && <p className={`rise sticker-sm rounded-2xl p-3 text-sm font-bold ${msg.ok ? "bg-go text-white" : "bg-volt"}`}>{msg.text}</p>}
        <p className="text-xs font-semibold text-ink/60">
          Your friend gets a text first and the phone only rings if they reply YES. The call starts with a quick AI + recording notice.
          Credits come back if they don't pick up. US &amp; Canada mobiles only. They can reply STOP to block all calls.
        </p>
      </form>

      <div className="space-y-3">
        <h2 className="text-2xl">Your calls</h2>
        <p className="text-sm font-bold text-ink/60">{credits} credits left</p>
        {!calls.length && <p className="sticker-sm rounded-2xl bg-panel p-4 text-sm font-semibold">No calls yet. Send your first one and the recording shows up here.</p>}
        {calls.map((c) => {
          const ch = characters.find((x) => x.id === c.character_id);
          const st = STATUS[c.status] ?? { label: c.status, tone: "bg-panel" };
          return (
            <div key={c.id} className="sticker-sm rounded-2xl bg-panel p-3">
              <div className="flex items-center gap-3">
                {ch && <CharacterFace id={ch.id} color={ch.accent} size={40} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold">{ch?.name ?? c.character_id} → {c.to ?? "friend"}</div>
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
