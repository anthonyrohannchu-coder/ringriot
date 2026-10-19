"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export function BillingButton() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/stripe/portal", { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (data.url) window.location.href = data.url;
          else { setErr("Couldn't open billing."); setBusy(false); }
        }}
        className="w-full sticker-sm press rounded-full bg-panel py-3 font-semibold disabled:opacity-60"
      >
        {busy ? "Opening…" : "Manage billing"}
      </button>
      {err && <p className="mt-1 text-xs text-nope">{err}</p>}
    </div>
  );
}

export function SignOut() {
  const router = useRouter();
  return (
    <button onClick={async () => { await supabaseBrowser().auth.signOut(); router.push("/"); router.refresh(); }} className="text-sm text-ink/70 hover:text-ink">
      Sign out
    </button>
  );
}

export function DeleteSession({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button aria-label="Delete conversation" className="hover:text-nope" onClick={async () => {
      if (!confirm("Delete this conversation and its transcript?")) return;
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      router.refresh();
    }}>✕</button>
  );
}

export function PrivacySettings({ save, days }: { save: boolean; days: number }) {
  const [s, setS] = useState(save);
  const [d, setD] = useState(days);
  const [saved, setSaved] = useState(false);
  async function update(patch: Record<string, unknown>) {
    setSaved(false);
    const r = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (r.ok) setSaved(true);
  }
  return (
    <div className="mt-3 space-y-3 text-sm">
      <label className="flex items-center justify-between gap-3">
        Save transcripts
        <input type="checkbox" checked={s} onChange={(e) => { setS(e.target.checked); update({ save_transcripts: e.target.checked }); }} className="h-5 w-5 accent-[#ff4fa3]" />
      </label>
      <label className="flex items-center justify-between gap-3">
        Auto-delete after
        <select value={d} onChange={(e) => { const v = Number(e.target.value); setD(v); update({ transcript_retention_days: v }); }} className="rounded-lg border-[2.5px] border-ink bg-paper px-2 py-1">
          {[7, 30, 90].map((n) => <option key={n} value={n}>{n} days</option>)}
        </select>
      </label>
      {saved && <p className="text-xs font-bold text-go">Saved</p>}
    </div>
  );
}

export function DeleteAccount() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        if (prompt('Type DELETE to permanently delete your account') !== "DELETE") return;
        setBusy(true);
        const r = await fetch("/api/account", { method: "DELETE" });
        if (r.ok) { await supabaseBrowser().auth.signOut(); window.location.href = "/"; }
        else { alert("Couldn't delete the account. Email support."); setBusy(false); }
      }}
      className="mt-3 rounded-full border border-nope px-5 py-2.5 text-sm font-semibold text-nope disabled:opacity-60"
    >
      {busy ? "Deleting…" : "Delete my account"}
    </button>
  );
}
