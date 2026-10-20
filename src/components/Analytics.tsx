"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Sends one first-party page-view beacon per page (no third-party scripts). */
export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    if (!path || path.startsWith("/api")) return;
    const body = JSON.stringify({ name: "page_view", path });
    try {
      if (!navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) {
        fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
      }
    } catch { /* analytics must never break the page */ }
  }, [path]);
  return null;
}
