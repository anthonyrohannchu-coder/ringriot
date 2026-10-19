import { creditPack, plans } from "@/config/plans";
import { BuyButton } from "./BuyButton";
import Link from "next/link";

export function PricingCards() {
  const tiers = [plans.free, plans.plus, plans.pro];
  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-3">
        {tiers.map((p) => {
          const featured = p.id === "plus";
          return (
            <div key={p.id} className={`sticker relative flex flex-col rounded-3xl p-6 ${featured ? "bg-volt md:-rotate-1 md:scale-[1.03]" : "bg-panel"}`}>
              {featured && <span className="sticker-sm absolute -top-4 right-5 rotate-3 rounded-full bg-hot px-3 py-1 label">most picked</span>}
              <h3 className="text-2xl">{p.name}</h3>
              <p className="display mt-3 text-5xl">
                {p.priceLabel}<span className="font-sans text-base font-bold text-ink/60">{p.id === "free" ? "" : "/mo"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 font-semibold">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span>✓</span>{f}</li>)}
              </ul>
              <div className="mt-6">
                {p.id === "free" ? (
                  <Link href="/#demo" className="sticker-sm press block rounded-full bg-panel py-3 text-center font-extrabold">Answer a free call</Link>
                ) : (
                  <BuyButton product={p.id} label={`Get ${p.name}`} primary={featured} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="sticker flex flex-col items-start justify-between gap-3 rounded-3xl bg-panel p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-lg font-extrabold">Need more? {creditPack.credits} extra credits for {creditPack.priceLabel}</p>
          <p className="font-medium text-ink/70">One-time. Works on any plan.</p>
        </div>
        <div className="w-full sm:w-48"><BuyButton product="credits_25" label="Buy credits" /></div>
      </div>
    </div>
  );
}
