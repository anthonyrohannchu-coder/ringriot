import Link from "next/link";

export default function Canceled() {
  return (
    <section className="grid min-h-[60dvh] place-items-center px-4 text-center">
      <div>
        <h1 className="text-4xl">Checkout canceled</h1>
        <p className="mt-3 text-ink/70">No charge was made. The free demo is still yours.</p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/pricing" className="sticker-sm press rounded-full bg-volt px-6 py-3 font-bold text-ink">Back to plans</Link>
          <Link href="/#demo" className="sticker-sm press rounded-full bg-panel px-6 py-3 font-semibold">Try the demo</Link>
        </div>
      </div>
    </section>
  );
}
