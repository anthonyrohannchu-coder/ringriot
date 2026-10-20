import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";
import { configuredCallerNumbers, ensureNumberWebhook, twilioConfigured } from "@/lib/twilio";
import { inviteSmsHref } from "@/lib/consent";
import { formatNumber } from "@/lib/phone";
import { brand } from "@/config/brand";

// A sender shares this link from their own phone. The friend opts in ONCE by texting
// "YES <code>" from the phone they want pranked; after that the sender's pranks ring them directly.
export const dynamic = "force-dynamic";
export const metadata = { title: "You've been invited to get pranked", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = raw.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);
  if (!code || !supabaseConfigured()) notFound();
  const { data: ref } = await supabaseAdmin().from("referral_codes").select("code").eq("code", code).maybeSingle();
  if (!ref) notFound();

  const number = configuredCallerNumbers()[0];
  if (number && twilioConfigured()) await ensureNumberWebhook(number).catch((err) => console.error("invite webhook", err));

  return (
    <section className="dots min-h-[70vh] bg-volt px-4 py-12">
      <div className="mx-auto max-w-xl">
        <p className="sticker-sm inline-block -rotate-2 rounded-full bg-hot px-3 py-1 label">you&apos;ve been invited</p>
        <h1 className="mt-4 text-4xl leading-[0.95] md:text-6xl">Your friend wants to prank-call you.</h1>
        <p className="mt-4 text-lg font-semibold">
          {brand.name} sends funny AI-character phone calls (a lost pizza guy, a furious customer, your &ldquo;ex&rdquo;…). Opt in once and
          your friend&apos;s pranks will ring you as a surprise, no heads-up text each time.
        </p>

        <div className="sticker mt-8 rounded-3xl bg-panel p-6">
          {number ? (
            <>
              <p className="label">One tap to opt in</p>
              <a href={inviteSmsHref(number, code)} className="sticker press mt-3 block rounded-full bg-ink py-4 text-center text-lg font-extrabold text-volt">
                💬 Text YES to opt in
              </a>
              <p className="mt-3 text-sm font-semibold text-ink/70">
                On a computer? From the phone you want pranked, text <b>YES {code.toUpperCase()}</b> to <b>{formatNumber(number)}</b>.
              </p>
            </>
          ) : (
            <p className="font-bold">Opt-ins aren&apos;t open yet. Check back soon.</p>
          )}
          <ul className="mt-5 space-y-2 text-sm font-semibold">
            <li>🤖 Every call starts by saying it&apos;s an AI comedy call and that it&apos;s recorded.</li>
            <li>🛑 Text <b>STOP</b> to {number ? formatNumber(number) : "us"} anytime and you&apos;ll never get another one.</li>
            <li>🧼 No threats, no fake officials, no asking for personal info.</li>
          </ul>
        </div>

        <p className="mt-6 text-center font-bold">
          Want to prank them back? <Link href={`/r/${code}`} className="underline">Try it free</Link>
        </p>
      </div>
    </section>
  );
}
