"use client";

import { useMemo, useState } from "react";
import type { CategoryId, Prank } from "@/lib/prankCategories";
import { categories } from "@/lib/prankCategories";
import { PrankCard } from "./PrankCard";

type Sort = "picks" | "new" | "az";

export function PrankLibrary({ pranks, initialCategory }: { pranks: Prank[]; initialCategory?: CategoryId }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<CategoryId | "all">(initialCategory ?? "all");
  const [sort, setSort] = useState<Sort>("picks");

  const shown = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const label = (id: CategoryId) => categories.find((c) => c.id === id)!.label.toLowerCase();
    const list = pranks.filter((p) => {
      if (cat !== "all" && p.category !== cat) return false;
      const hay = `${p.title} ${p.blurb} ${label(p.category)}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
    const byPick = (p: Prank) => p.pick ?? 100 + (p.isNew ? 0 : 50);
    return [...list].sort((a, b) =>
      sort === "az" ? a.title.localeCompare(b.title)
      : sort === "new" ? Number(b.isNew) - Number(a.isNew) || byPick(a) - byPick(b)
      : byPick(a) - byPick(b));
  }, [pranks, q, cat, sort]);

  const chip = (active: boolean) =>
    `sticker-sm shrink-0 rounded-full px-4 py-2 text-sm font-extrabold ${active ? "bg-ink text-paper" : "press bg-panel"}`;

  return (
    <div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <label className="relative flex-1">
          <span className="sr-only">Search pranks</span>
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg" aria-hidden>🔎</span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search: pizza, ex, lottery, neighbor…"
            className="sticker-sm h-12 w-full rounded-full bg-panel pl-11 pr-4 font-semibold outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-extrabold">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="sticker-sm h-12 rounded-full bg-panel px-4 font-bold outline-none">
            <option value="picks">Top picks</option>
            <option value="new">Newest</option>
            <option value="az">A–Z</option>
          </select>
        </label>
      </div>

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label="Categories">
        <button type="button" className={chip(cat === "all")} aria-pressed={cat === "all"} onClick={() => setCat("all")}>All · {pranks.length}</button>
        {categories.map((c) => (
          <button type="button" key={c.id} className={chip(cat === c.id)} aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            <span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full border-2 border-ink align-middle" style={{ background: c.color }} />
            {c.label}
          </button>
        ))}
      </div>

      {shown.length ? (
        <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((p) => <PrankCard key={p.slug} prank={p} />)}
        </div>
      ) : (
        <p className="sticker-sm mt-6 rounded-2xl bg-panel p-5 font-bold">
          No pranks match &ldquo;{q}&rdquo;. Try a different word, or{" "}
          <button type="button" className="underline decoration-[3px] underline-offset-4" onClick={() => { setQ(""); setCat("all"); }}>show everything</button>.
        </p>
      )}
    </div>
  );
}
