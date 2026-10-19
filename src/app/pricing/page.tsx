import { PricingCards } from "@/components/PricingCards";

export const metadata = { title: "Pricing" };

export default function PricingPage() {
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <p className="label text-hot">Pricing</p>
        <h1 className="mt-2 text-5xl">Pick your level of chaos</h1>
        <p className="mt-3 max-w-xl text-ink/70">1 credit = one conversation (up to 12 AI replies with voice). Every conversation shows its cost before it starts. No unlimited plans, no surprise charges.</p>
        <div className="mt-10"><PricingCards /></div>
        <p className="mt-6 text-sm text-ink/70">Billed monthly through Stripe. Cancel anytime from your dashboard.</p>
      </div>
    </section>
  );
}
