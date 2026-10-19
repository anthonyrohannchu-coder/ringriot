import Link from "next/link";
import { characters, publicCharacter } from "@/lib/characters";
import { DemoChat } from "@/components/DemoChat";
import { PricingCards } from "@/components/PricingCards";
import { brand } from "@/config/brand";
import { FREE_DEMO_REPLIES_PER_DAY } from "@/config/plans";

const faqs = [
  ["Is it a real phone call?", "Not yet. Everything on this site today is a browser simulation, and it's labeled that way. Consent-based real calls are coming as a separate feature, with caller ID, a recording disclosure, and the recipient's opt-in."],
  ["Can I prank a business or a stranger?", "No. Real calls will only go to people who have agreed to receive them. We block emergency numbers, caller-ID spoofing, harassment, and impersonating real people or organizations."],
  ["What's a credit?", "One credit is one AI conversation with a character, up to 12 replies with voice. You always see the cost before you start."],
  ["Do I need to download anything?", "No. It runs in your phone's browser. You can add it to your home screen if you want it to feel like an app."],
  ["Can I cancel anytime?", "Yes. Manage or cancel from your dashboard in two taps. You keep access until the end of the billing period."],
];

export default function Home() {
  const pub = characters.map(publicCharacter);
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden px-4 pt-10 pb-6 md:pt-20">
        <div className="mx-auto max-w-6xl">
          <p className="label text-volt">AI characters · instant chaos</p>
          <h1 className="mt-3 max-w-3xl text-[44px] font-extrabold leading-[0.95] tracking-tight md:text-7xl">
            Unhinged AI characters.<br />
            <span className="text-volt">Real</span> conversations.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Pick a character, hit start, and talk back. They hear you, improvise, and get weirder every line. Turn the best moments into clips.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <a href="#demo" className="rounded-full bg-volt px-7 py-3.5 text-base font-bold text-ink active:scale-95">Try it free →</a>
            <Link href="/pricing" className="rounded-full border border-line px-7 py-3.5 text-base font-semibold">See plans</Link>
          </div>
          <p className="mt-3 text-sm text-muted">{FREE_DEMO_REPLIES_PER_DAY} free replies a day. No signup to try.</p>
        </div>
      </section>

      {/* Live demo */}
      <section id="demo" className="scroll-mt-16 px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <DemoChat characters={pub} mode="demo" />
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 py-14">
        <div className="mx-auto grid max-w-6xl gap-4 md:grid-cols-3">
          {[
            ["01", "Pick a character", "Eight originals, from a soap-opera customer to a detective hunting a stapler."],
            ["02", "Talk back", "Type or use your mic. The AI listens and escalates the bit in their own voice."],
            ["03", "Clip it", "Get a hook and caption from the funniest line, ready for TikTok, Reels or Shorts."],
          ].map(([n, t, d]) => (
            <div key={n} className="rounded-3xl border border-line bg-panel p-6">
              <p className="label text-volt">{n}</p>
              <h3 className="mt-3 text-2xl font-bold">{t}</h3>
              <p className="mt-2 text-muted">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Characters */}
      <section id="characters" className="scroll-mt-16 px-4 py-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">Meet the cast</h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {characters.map((c) => (
              <div key={c.id} className="group rounded-3xl border border-line bg-panel p-5 transition hover:-translate-y-1" style={{ boxShadow: `inset 0 1px 0 ${c.accent}33` }}>
                <div className="flex items-start justify-between">
                  <span className="grid h-14 w-14 place-items-center rounded-2xl text-3xl" style={{ background: `${c.accent}1f` }}>{c.emoji}</span>
                  <span className="label rounded-full border border-line px-2 py-1 text-[9px]" style={{ color: c.tier === "free" ? c.accent : undefined }}>
                    {c.tier === "free" ? "free" : c.tier}
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold">{c.name}</h3>
                <p className="text-sm" style={{ color: c.accent }}>{c.archetype}</p>
                <p className="mt-2 text-sm text-muted">{c.description}</p>
                <p className="mt-3 border-l-2 pl-3 text-sm italic text-white/80" style={{ borderColor: c.accent }}>&ldquo;{c.exampleLine}&rdquo;</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-4xl font-extrabold tracking-tight md:text-5xl">Plans</h2>
          <p className="mt-2 text-muted">The demo is free. Keep the chaos going with a subscription.</p>
          <div className="mt-8"><PricingCards /></div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-4 py-14">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-4xl font-extrabold tracking-tight">Questions</h2>
          <div className="mt-6 divide-y divide-line rounded-3xl border border-line bg-panel">
            {faqs.map(([q, a]) => (
              <details key={q} className="group p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between text-lg font-semibold">
                  {q}<span className="text-muted transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-muted">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted">Still curious? <a className="underline" href={`mailto:${brand.supportEmail}`}>Email us</a>.</p>
        </div>
      </section>
    </>
  );
}
