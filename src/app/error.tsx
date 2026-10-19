"use client";
import { useEffect } from "react";

// Friendly fallback for any page error. If the browser has an old copy of the
// site's scripts after a deploy (ChunkLoadError), reload once automatically.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    const stale = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(String(error?.message ?? ""));
    try {
      if (stale && !sessionStorage.getItem("rr_reloaded")) {
        sessionStorage.setItem("rr_reloaded", "1");
        window.location.reload();
      }
    } catch {}
  }, [error]);

  return (
    <section className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Something glitched</h1>
        <p className="mt-2 text-muted">The page hit a snag. Reloading usually fixes it.</p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={() => window.location.reload()} className="rounded-full bg-volt px-6 py-3 font-bold text-ink">Reload</button>
          <button onClick={reset} className="rounded-full border border-line px-6 py-3 font-semibold">Try again</button>
        </div>
      </div>
    </section>
  );
}
