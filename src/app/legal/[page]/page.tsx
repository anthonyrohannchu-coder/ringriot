import { notFound } from "next/navigation";
import { brand } from "@/config/brand";

// Starter policies. Have a lawyer review before launch, especially before real calls.
const pages: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: "Terms of Service",
    body: [
      `${brand.name} provides AI-generated comedy conversations with fictional characters for entertainment.`,
      "You must be 18 or older, or 13+ with a parent's permission where local law allows.",
      "Subscriptions renew monthly until canceled. You can cancel anytime from your dashboard; access continues until the end of the paid period. Credits have no cash value.",
      "We may suspend accounts that break the Acceptable Use policy, without refund for the current period.",
      "The service is provided as-is. AI output can be unpredictable; you are responsible for how you share it.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "We collect your email (to log you in), your plan and credit history, and conversation transcripts only if you keep 'Save transcripts' on.",
      "Transcripts auto-delete after the retention period you choose (default 30 days). You can delete any conversation or your whole account at any time.",
      "Payments are processed by Stripe; we never see or store your full card number.",
      "We count page visits and key steps (sign-up, checkout, calls) with our own first-party analytics and a random anonymous ID cookie. No advertising trackers, and no phone numbers are stored in analytics.",
      "Conversation text is sent to our AI provider to generate replies. We do not sell personal data.",
      `Questions or deletion requests: ${brand.supportEmail}.`,
    ],
  },
  "acceptable-use": {
    title: "Acceptable Use",
    body: [
      "Keep it fun and consensual. Characters are fictional and must stay that way.",
      "Not allowed: harassment, threats, bullying, hate, sexual content involving anyone, targeting minors, or anything that frightens or humiliates a real person.",
      "Not allowed: impersonating real people, businesses, police, government, banks or emergency services; caller-ID spoofing; calling emergency numbers.",
      "Real phone calls (when available) may only go to people who have agreed to receive them. Calls include caller identification and a recording disclosure.",
      "Shared clips must be labeled as AI-generated and must not include anyone's voice without their permission.",
    ],
  },
};

export function generateStaticParams() {
  return Object.keys(pages).map((page) => ({ page }));
}

export default async function LegalPage({ params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const p = pages[page];
  if (!p) notFound();
  return (
    <section className="px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-4xl">{p.title}</h1>
        <ul className="mt-6 space-y-4 text-ink/70">
          {p.body.map((b) => <li key={b} className="leading-relaxed">{b}</li>)}
        </ul>
      </div>
    </section>
  );
}
