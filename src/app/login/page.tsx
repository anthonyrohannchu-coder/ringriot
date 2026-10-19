"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/dashboard";
    const ref = document.cookie.match(/(?:^|; )rr_ref=([^;]+)/)?.[1];
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        data: ref ? { ref: decodeURIComponent(ref) } : undefined, // creator attribution on signup
      },
    });
    if (error) { setErr(error.message); setState("error"); } else setState("sent");
  }

  return (
    <section className="grid min-h-[70dvh] place-items-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-line bg-panel p-7">
        <h1 className="text-3xl font-extrabold tracking-tight">Log in or sign up</h1>
        <p className="mt-2 text-sm text-muted">We&apos;ll email you a magic link. No password to forget.</p>
        {state === "sent" ? (
          <p className="mt-6 rounded-xl border border-volt/40 bg-volt/10 p-4 text-sm">Check <b>{email}</b> for your login link. You can close this tab.</p>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-3">
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email"
              className="h-12 w-full rounded-full border border-line bg-ink px-4 outline-none focus:border-white/50" />
            <button disabled={state === "sending"} className="h-12 w-full rounded-full bg-volt font-bold text-ink disabled:opacity-60">
              {state === "sending" ? "Sending…" : "Email me a link"}
            </button>
            {state === "error" && <p className="text-sm text-hot">{err}</p>}
          </form>
        )}
        <p className="mt-5 text-xs text-muted">By continuing you agree to the Terms and Acceptable Use policy.</p>
      </div>
    </section>
  );
}
