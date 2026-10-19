import Link from "next/link";

// Purely informational. Credits/plan are granted only by the verified Stripe webhook.
export default function Success() {
  return (
    <section className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div>
        <p className="text-6xl">🎉</p>
        <h1 className="mt-4 text-4xl">Payment received</h1>
        <p className="mt-3 text-ink/70">Your plan and credits activate as soon as Stripe confirms, usually within a few seconds.</p>
        <Link href="/dashboard" className="mt-6 inline-block sticker-sm press rounded-full bg-volt px-7 py-3.5 font-bold text-ink">Go to dashboard</Link>
      </div>
    </section>
  );
}
