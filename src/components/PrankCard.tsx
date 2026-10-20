"use client";

import Link from "next/link";
import { useState } from "react";
import type { Prank } from "@/lib/prankCategories";
import { categoryOf } from "@/lib/prankCategories";
import { PrankArt } from "./PrankArt";

function speak(text: string) {
  const s = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!s) return false;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 1.05;
  s.speak(u);
  return true;
}

export function TierBadge({ tier }: { tier: Prank["tier"] }) {
  return (
    <span className={`sticker-sm rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${tier === "free" ? "bg-go text-white" : "bg-volt"}`}>
      {tier === "free" ? "free" : `🔒 ${tier}`}
    </span>
  );
}

export function PrankCard({ prank, tilt = 0 }: { prank: Prank; tilt?: number }) {
  const [open, setOpen] = useState(false);
  const cat = categoryOf(prank.category);
  return (
    <article
      className="sticker flex flex-col overflow-hidden rounded-3xl bg-panel transition-transform hover:-translate-y-0.5"
      style={tilt ? { transform: `rotate(${tilt}deg)` } : undefined}
    >
      <div className="relative">
        <PrankArt prank={prank} />
        <div className="absolute left-3 top-3 flex gap-1.5">
          <span className="sticker-sm rounded-full bg-panel px-2 py-0.5 text-[10px] font-extrabold uppercase">{cat.short}</span>
          {prank.isNew && <span className="sticker-sm rounded-full bg-hot px-2 py-0.5 text-[10px] font-extrabold uppercase text-white">New</span>}
        </div>
        <div className="absolute right-3 top-3"><TierBadge tier={prank.tier} /></div>
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-lg leading-tight">{prank.title}</h3>
        <p className="mt-1.5 flex-1 text-sm font-medium text-ink/75">{prank.blurb}</p>
        {open && (
          <p className="rise mt-3 rounded-xl border-2 border-dashed border-ink/30 p-2.5 text-sm font-bold italic">
            &ldquo;{prank.opener}&rdquo;
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => { const next = !open; setOpen(next); if (next) speak(prank.opener); else window.speechSynthesis?.cancel(); }}
            aria-expanded={open}
            className="sticker-sm press rounded-full bg-panel px-3 py-2 text-sm font-extrabold"
          >
            {open ? "■ Stop" : "▶ Preview"}
          </button>
          <Link href={`/call?prank=${prank.slug}`} className="sticker-sm press flex-1 rounded-full bg-ink px-3 py-2 text-center text-sm font-extrabold text-volt">
            Send this prank
          </Link>
        </div>
      </div>
    </article>
  );
}
