"use client";

// Last-resort fallback when the root layout itself fails.
export default function GlobalError({ error }: { error: Error }) {
  if (typeof window !== "undefined") {
    try {
      if (!sessionStorage.getItem("rr_reloaded")) {
        sessionStorage.setItem("rr_reloaded", "1");
        window.location.reload();
      }
    } catch {}
    console.error(error);
  }
  return (
    <html lang="en">
      <body style={{ background: "#08080c", color: "#f4f4f8", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0, padding: 16, textAlign: "center" }}>
        <div>
          <h1 style={{ fontSize: 28 }}>Something glitched</h1>
          <p style={{ color: "#8b8b9e" }}>Reloading usually fixes it.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, background: "#d4ff3d", color: "#08080c", border: 0, borderRadius: 999, padding: "12px 24px", fontWeight: 700, fontSize: 16 }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
