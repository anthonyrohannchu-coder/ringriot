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
      const data = await res.json();
      if (res.status === 401) return (window.location.href = `/login?next=/pricing`);
      if (!res.ok || !data.url) return setMsg(data.message ?? (data.error === "stripe_not_configured" ? "Payments aren't switched on yet." : "Couldn't start checkout."));
      window.location.href = data.url;
    } catch {
      setMsg("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className={`w-full rounded-full py-3 font-bold transition active:scale-[.98] disabled:opacity-60 ${primary ? "bg-volt text-ink" : "border border-line bg-ink hover:border-white/40"}`}
      >
        {busy ? "Opening checkout…" : label}
      </button>
      {msg && <p className="mt-2 text-xs text-hot">{msg}</p>}
    </div>
  );
}
