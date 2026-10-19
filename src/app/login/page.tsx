"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (mode === "signup") {
        const r = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok && d.error !== "exists") throw new Error(d.message || "Couldn't create the account.");
        if (d.error === "exists") setMode("login");
      }
      const { error } = await supabaseBrowser().auth.signInWithPassword({ email: email.toLowerCase(), password });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      const next = new URLSearchParams(window.location.search).get("next") || "/dashboard";
      window.location.href = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <section className="grid min-h-[70dvh] place-items-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-panel p-7">
        <div className="grid grid-cols-2 rounded-full border border-line p-1 text-sm font-semibold">
          {(["signup", "login"] as const).map((m) => (
            <button key={m} type="button" onClick={() => { setMode(m); setErr(""); }}
              className={`rounded-full py-2 ${mode === m ? "bg-volt text-ink" : "text-muted"}`}>
              {m === "signup" ? "Sign up" : "Log in"}
            </button>
          ))}
        </div>
        <h1 className="mt-6 text-3xl font-extrabold tracking-tight">{mode === "signup" ? "Create your account" : "Welcome back"}</h1>
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email"
            className="h-12 w-full rounded-full border border-line bg-ink px-4 outline-none focus:border-white/50" />
          <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "Password (8+ characters)" : "Password"} autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className="h-12 w-full rounded-full border border-line bg-ink px-4 outline-none focus:border-white/50" />
          <button disabled={busy} className="h-12 w-full rounded-full bg-volt font-bold text-ink disabled:opacity-60">
            {busy ? "One sec…" : mode === "signup" ? "Create account" : "Log in"}
          </button>
          {err && <p className="text-sm text-hot">{err}</p>}
        </form>
        <p className="mt-5 text-xs text-muted">By continuing you agree to the Terms and Acceptable Use policy.</p>
      </div>
    </section>
  );
}
