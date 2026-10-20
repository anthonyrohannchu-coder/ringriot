import Link from "next/link";
import { characters, publicCharacter } from "@/lib/characters";
import { categories, featuredPranks, pranks } from "@/lib/pranks";
import { DemoChat } from "@/components/DemoChat";
import { PricingCards } from "@/components/PricingCards";
import { PersonFace } from "@/components/PersonFace";
import { PrankArt } from "@/components/PrankArt";
import { PrankCard } from "@/components/PrankCard";
import { brand } from "@/config/brand";
import { FREE_DEMO_REPLIES_PER_DAY } from "@/config/plans";
import { CALL_CREDIT_COST, twilioConfigured } from "@/lib/twilio";

export default function Home() {
  const pub = characters.map(publicCharacter);
  const quotes = pranks.filter((p, i) => i % 3 === 0).map((p) => ({ id: p.slug, look: p.look, line: p.opener.split(/(?<=[.!?])\s/)[0] }));
  const callsLive = twilioConfigured();
  const faqs: [string, string][] = [
    [
      "Is it a real phone call?",
      callsLive
        ? `Yes, on Plus and Pro. Your friend gets a text first, and their phone only rings if they reply YES. You can also try any prank free in your browser.`
        : `Real phone calls are switching on soon for Plus and Pro, and they'll only ring friends who reply YES first. Right now you can try every free prank in your browser.`,
    ],
    ["Does my friend know it's AI?", "Yes. Every call opens with a quick notice that it's an AI comedy call and that it's recorded. If they ask \"are you a robot?\", the character admits it. Saying \"stop\" ends the call right away."],
    ["Can I prank a business or a stranger?", "Nope. No businesses, no strangers, no emergency numbers, no pretending to be real people or officials. Your friends, with their OK."],
    ["What's a credit?", `In the browser, 1 credit is one conversation (up to 12 replies with voice). A real phone call costs ${CALL_CREDIT_COST} credits, and you get them back if your friend doesn't pick up.`],
    ["Can I cancel anytime?", "Yes, from your account in two taps. You keep access until the end of the month you paid for."],
  ];
  const heroArt = featuredPranks.slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="dots border-b-[3px] border-ink bg-volt px-4 pb-14 pt-10 md:pt-16">
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="sticker-sm inline-block -rotate-2 rounded-full bg-hot px-3 py-1 label">AI prank calls · with your friend&apos;s OK</p>
            <h1 className="mt-5 text-[46px] leading-[0.95] md:text-[78px]">
              Fake people.<br />
              <span className="relative inline-block">
                Real chaos.
                <svg viewBox="0 0 300 20" className="absolute -bottom-3 left-0 w-full" aria-hidden><path d="M4 14 Q75 2 150 12 T296 8" stroke="#ff4fa3" strokeWidth="7" fill="none" strokeLinecap="round" /></svg>
              </span>
            </h1>
            <p className="mt-6 max-w-lg text-lg font-semibold md:text-xl">
              Pick a ridiculous situation, add your friend&apos;s number, and an AI character calls them. It listens, reacts to every word, and you get the recording.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/pranks" className="sticker press rounded-full bg-ink px-7 py-4 text-lg font-extrabold text-volt">📞 Browse {pranks.length} pranks</Link>
              <a href="#demo" className="sticker press rounded-full bg-panel px-7 py-4 text-lg font-extrabold">Try one free</a>
            </div>
            <p className="mt-4 text-sm font-bold">{FREE_DEMO_REPLIES_PER_DAY} free replies a day in your browser · no signup · works on your phone</p>
          </div>

          {/* Sticker pile of prank covers */}
          <div className="relative mx-auto hidden h-[380px] w-[380px] md:block" aria-hidden>
            {heroArt.map((p, i) => {
              const pos = ["left-0 top-2 rotate-[-9deg] z-10", "right-0 top-16 rotate-[8deg] z-20", "left-10 bottom-0 rotate-[-3deg] z-30"][i];
              return (
                <div key={p.slug} className={`sticker absolute w-[230px] overflow-hidden rounded-3xl bg-panel ${pos}`}>
                  <PrankArt prank={p} size="sm" />
                  <p className="px-3 py-2 text-sm font-extrabold leading-tight">{p.title}</p>
                </div>
              );
            })}
            <div className="sticker absolute -right-2 bottom-24 z-40 rotate-[6deg] rounded-2xl bg-panel px-3 py-2 text-sm font-extrabold">
              &ldquo;You hit Bernadette!&rdquo;
            </div>
          </div>
        </div>
      </section>

      {/* Quote ticker */}
      <div className="overflow-hidden border-b-[3px] border-ink bg-ink py-3 text-paper" aria-hidden>
        <div className="ticker gap-8">
          {[...quotes, ...quotes].map((q, i) => (
            <span key={i} className="flex shrink-0 items-center gap-3 pr-8 font-bold">
              <PersonFace look={q.look} size={28} />
              &ldquo;{q.line}&rdquo;
              <span className="text-volt">★</span>
            </span>
          ))}
        </div>
      </div>

      {/* Top picks */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-4xl md:text-5xl">Top picks</h2>
              <p className="mt-2 text-lg font-semibold text-muted">Tap Preview to hear how the call opens.</p>
            </div>
            <Link href="/pranks" className="sticker-sm press rounded-full bg-panel px-5 py-2.5 font-extrabold">See all {pranks.length} →</Link>
          </div>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {featuredPranks.slice(0, 8).map((p, i) => <PrankCard key={p.slug} prank={p} tilt={i % 2 ? 0.6 : -0.6} />)}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="border-y-[3px] border-ink bg-ink px-4 py-14 text-paper">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl text-volt md:text-5xl">Pick your situation</h2>
          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-5">
            {categories.map((c, i) => {
              const sample = pranks.find((p) => p.category === c.id)!;
              const count = pranks.filter((p) => p.category === c.id).length;
              return (
                <Link key={c.id} href={`/pranks?cat=${c.id}`} className={`sticker press block overflow-hidden rounded-3xl bg-panel text-ink ${i % 2 ? "rotate-1" : "-rotate-1"}`}>
                  <PrankArt prank={sample} size="sm" face={false} />
                  <div className="p-3">
                    <p className="font-extrabold leading-tight">{c.label}</p>
                    <p className="text-xs font-bold text-ink/60">{count} pranks</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-hot px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">How it works</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-4">
            {[
              ["Pick a prank", "A fake lottery win, an ex at 2 a.m., a car named Bernadette. All original, all silly."],
              ["Add your friend", "Enter their number and your name. Choose which RingRiot number calls them."],
              ["They text YES", "Your friend gets a heads-up text. Their phone only rings if they agree."],
              ["Listen back", "The character talks to them live and reacts to what they say. You get the recording."],
            ].map(([t, d], i) => (
              <li key={t} className={`sticker rounded-3xl bg-panel p-6 ${i % 2 ? "md:rotate-1" : "md:-rotate-1"}`}>
                <span className="sticker-sm grid h-11 w-11 place-items-center rounded-full bg-volt display text-xl">{i + 1}</span>
                <h3 className="mt-4 text-2xl">{t}</h3>
                <p className="mt-2 font-medium text-ink/80">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Live demo */}
      <section id="demo" className="scroll-mt-20 border-t-[3px] border-ink px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">Try it on yourself first.</h2>
          <p className="mt-2 text-lg font-semibold text-muted">Answer a prank in your browser and talk back. Free, no signup. Turn your sound on.</p>
          <div className="mt-8">
            <DemoChat characters={pub} mode="demo" />
          </div>
        </div>
      </section>

      {/* Trust & safety */}
      <section className="dots border-y-[3px] border-ink bg-ice/15 px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">Funny, not mean.</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["✋", "They opt in", "No YES, no call. Your friend can reply STOP anytime to block every future call."],
              ["🤖", "Always says it's AI", "Each call opens with an AI and recording notice, and the character admits it if asked."],
              ["🛑", "\"Stop\" means stop", "Saying stop or hanging up ends it immediately. Credits come back if they don't pick up."],
              ["🧼", "Clean comedy", "No threats, no fake officials, no stereotypes or accents, no asking for personal info."],
            ].map(([icon, t, d]) => (
              <div key={t} className="sticker rounded-3xl bg-panel p-5">
                <span className="text-3xl" aria-hidden>{icon}</span>
                <h3 className="mt-3 text-xl">{t}</h3>
                <p className="mt-1.5 text-sm font-medium text-ink/80">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl md:text-5xl">Plans</h2>
          <p className="mt-2 text-lg font-semibold text-muted">The browser demo is free. Real calls and the full library come with a plan.</p>
          <div className="mt-8"><PricingCards /></div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t-[3px] border-ink px-4 py-14">
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
