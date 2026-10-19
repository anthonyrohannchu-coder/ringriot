import { creditPack, plans } from "@/config/plans";
import { BuyButton } from "./BuyButton";
import Link from "next/link";

export function PricingCards() {
  const tiers = [plans.free, plans.plus, plans.pro];
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {tiers.map((p) => {
          const featured = p.id === "plus";
          return (
            <div key={p.id} className={`flex flex-col rounded-3xl border p-6 ${featured ? "border-volt bg-volt/[.04]" : "border-line bg-panel"}`}>
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold">{p.name}</h3>
                {featured && <span className="label rounded-full bg-volt px-2 py-1 text-[9px] text-ink">most picked</span>}
              </div>
              <p className="mt-3 text-5xl font-extrabold tracking-tight">
                {p.priceLabel}<span className="text-base font-medium text-muted">{p.id === "free" ? "" : "/mo"}</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm">
                {p.features.map((f) => <li key={f} className="flex gap-2"><span className="text-volt">✓</span>{f}</li>)}
              </ul>
              <div className="mt-6">
                {p.id === "free" ? (
                  <Link href="/#demo" className="block rounded-full border border-line py-3 text-center font-semibold">Try the demo</Link>
                ) : (
                  <BuyButton product={p.id} label={`Get ${p.name}`} primary={featured} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col items-start justify-between gap-3 rounded-3xl border border-line bg-panel p-5 sm:flex-row sm:items-center">
        <div>
          <p className="font-bold">Need more? {creditPack.credits} extra credits for {creditPack.priceLabel}</p>
          <p className="text-sm text-muted">One-time. Works on any plan. Credits don&apos;t expire while your account is open.</p>
        </div>
        <div className="w-full sm:w-48"><BuyButton product="credits_25" label="Buy credits" /></div>
      </div>
    </div>
  );
}
