"use client";
import { useState } from "react";

export function BuyButton({ product, label, primary }: { product: "plus" | "pro" | "credits_25"; label: string; primary?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.href = `/login?next=/pricing`;
        return;
      }
      if (!res.ok || !data.url) {
        setMsg(data.message ?? (data.error === "stripe_not_configured" ? "Payments aren't switched on yet." : "Couldn't open checkout. Try again."));
        setBusy(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setMsg("Network error. Try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className={`sticker-sm press w-full rounded-full py-3 font-extrabold disabled:opacity-60 ${primary ? "bg-ink text-volt" : "bg-panel"}`}
      >
        {busy ? "Opening checkout…" : label}
      </button>
      {msg && <p className="mt-2 text-sm font-bold text-nope">{msg}</p>}
    </div>
  );
}
