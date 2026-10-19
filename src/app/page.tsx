import Link from "next/link";
import { characters, publicCharacter } from "@/lib/characters";
import { DemoChat } from "@/components/DemoChat";
import { PricingCards } from "@/components/PricingCards";
import { CharacterFace } from "@/components/CharacterFace";
import { brand } from "@/config/brand";
import { FREE_DEMO_REPLIES_PER_DAY } from "@/config/plans";

const faqs = [
  ["Is it a real phone call?", "Not yet. Everything here is a browser simulation, and it says so on screen. Real calls are coming, and they'll only go to friends who agreed to get one."],
  ["Can I prank a business or a stranger?", "Nope. No businesses, no strangers, no emergency numbers, no pretending to be real people. Your friends, with their OK."],
  ["What's a credit?", "One credit = one call with a character, up to 12 replies with voice. You always see the cost before you call."],
  ["Do I need to download anything?", "No. It works in your phone's browser. Add it to your home screen if you want it to feel like an app."],
  ["Can I cancel anytime?", "Yes, from your account in two taps. You keep access until the end of the month you paid for."],
];

export default function Home() {
  const pub = characters.map(publicCharacter);
  const quotes = characters.map((c) => ({ id: c.id, color: c.accent, line: c.exampleLine, name: c.name }));
  return (
    <>
      {/* Hero */}
      <section className="dots border-b-[3px] border-ink bg-volt px-4 pb-14 pt-10 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="sticker-sm inline-block -rotate-2 rounded-full bg-hot px-3 py-1 label">⚠ zero chill detected</p>
            <h1 className="mt-5 text-[46px] leading-[0.95] md:text-[78px]">
              Fake people.<br />
              <span className="relative inline-block">
                Real chaos.
                <svg viewBox="0 0 300 20" className="absolute -bottom-3 left-0 w-full" aria-hidden><path d="M4 14 Q75 2 150 12 T296 8" stroke="#ff4fa3" strokeWidth="7" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-lg font-semibold md:text-xl">
              Pick an unhinged character, hit call, and talk back. They hear you, never break character, and get weirder every line.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <a href="#demo" className="sticker press rounded-full bg-ink px-7 py-4 text-lg font-extrabold text-volt">☎ Answer a call</a>
              <a href="#cast" className="sticker press rounded-full bg-panel px-7 py-4 text-lg font-extrabold">Meet the weirdos</a>
            </div>
            <p className="mt-4 text-sm font-bold">{FREE_DEMO_REPLIES_PER_DAY} free replies a day · no signup · works on your phone</p>
          </div>

          {/* Sticker pile of faces */}
          <div className="relative mx-auto hidden h-[360px] w-[360px] md:block" aria-hidden>
            {characters.slice(0, 5).map((c, i) => {
              const pos = [
                "left-[90px] top-[70px] rotate-[-6deg] z-30",
                "left-0 top-0 rotate-[-14deg] z-20",
                "right-0 top-4 rotate-[12deg] z-20",
                "left-4 bottom-0 rotate-[8deg] z-10",
                "right-6 bottom-6 rotate-[-10deg] z-10",
              ][i];
              const size = i === 0 ? 190 : 120;
              return (
                <div key={c.id} className={`absolute ${pos}`}>
                  <div className="sticker rounded-[28px] bg-panel p-2">
                    <CharacterFace id={c.id} color={c.accent} size={size} />
                  </div>
                </div>
              );
            })}
            <div className="sticker absolute -right-4 top-[150px] z-40 rotate-[8deg] rounded-2xl bg-panel px-3 py-2 text-sm font-extrabold">
              &ldquo;The lamp flickered. ONCE.&rdquo;
            </div>
          </div>
        </div>
      </section>

      {/* Quote ticker */}
      <div className="overflow-hidden border-b-[3px] border-ink bg-ink py-3 text-paper" aria-hidden>
        <div className="ticker gap-8">
          {[...quotes, ...quotes].map((q, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3 pr-8 font-bold">
              <CharacterFace id={q.id} color={q.color} size={28} />
              &ldquo;{q.line}&rdquo;
              <span className="text-volt">★</span>
            </span>
          ))}
        </div>
      </div>

      {/* Live demo */}
      <section id="demo" className="scroll-mt-20 px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">Your phone is ringing.</h2>
          <p className="mt-2 text-lg font-semibold text-muted">Pick a character, then answer. Turn your sound on.</p>
          <div className="mt-8">
            <DemoChat characters={pub} mode="demo" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="border-y-[3px] border-ink bg-hot px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">How it works</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {[
              ["Pick a weirdo", "Eight originals, from a soap-opera customer to a detective hunting a stapler."],
              ["Talk back", "Type or use your mic. They react to what you actually say, in their own voice."],
              ["Clip it", "Get a hook and caption from the funniest line, ready for TikTok, Reels or Shorts."],
            ].map(([t, d], i) => (
              <li key={t} className={`sticker rounded-3xl bg-panel p-6 ${i === 1 ? "md:rotate-1" : i === 2 ? "md:-rotate-1" : ""}`}>
                <span className="sticker-sm grid h-11 w-11 place-items-center rounded-full bg-volt display text-xl">{i + 1}</span>
                <h3 className="mt-4 text-2xl">{t}</h3>
                <p className="mt-2 font-medium text-ink/80">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Cast */}
      <section id="cast" className="scroll-mt-20 px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">Meet the weirdos</h2>
          <p className="mt-2 text-lg font-semibold text-muted">Three are free. The rest unlock with Plus or Pro.</p>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {characters.map((c, i) => (
              <Link
                href={c.tier === "free" ? "/#demo" : "/pricing"}
                key={c.id}
                className={`sticker press group block rounded-3xl bg-panel p-5 ${i % 2 ? "rotate-1" : "-rotate-1"}`}
              >
                <div className="flex items-start justify-between">
                  <div className="rounded-2xl p-1" style={{ background: c.accent }}>
                    <CharacterFace id={c.id} color={c.accent} size={80} />
                  </div>
                  <span className={`sticker-sm rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${c.tier === "free" ? "bg-go text-white" : "bg-volt"}`}>
                    {c.tier === "free" ? "free" : `🔒 ${c.tier}`}
                  </span>
                </div>
                <h3 className="mt-4 text-xl leading-tight">{c.name}</h3>
                <p className="text-sm font-extrabold" style={{ color: "#17121a", textDecoration: `underline 3px ${c.accent}`, textUnderlineOffset: 3 }}>{c.archetype}</p>
                <p className="mt-2 text-sm font-medium text-ink/75">{c.description}</p>
                <p className="mt-3 rounded-xl border-2 border-dashed border-ink/30 p-2.5 text-sm font-bold italic">&ldquo;{c.exampleLine}&rdquo;</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="dots border-y-[3px] border-ink bg-ice/15 px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">Plans</h2>
          <p className="mt-2 text-lg font-semibold text-muted">The demo is free. Keep the chaos going with a plan.</p>
          <div className="mt-8"><PricingCards /></div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-4xl md:text-5xl">Questions</h2>
          <div className="mt-6 space-y-3">
            {faqs.map(([q, a]) => (
              <details key={q} className="sticker-sm group rounded-2xl bg-panel p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-extrabold">
                  {q}<span className="display text-2xl transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 font-medium text-ink/80">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center font-semibold text-muted">Still curious? Email {brand.supportEmail}</p>
        </div>
      </section>
    </>
  );
}
