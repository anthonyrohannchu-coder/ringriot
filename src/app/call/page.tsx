import Link from "next/link";
import { redirect } from "next/navigation";
import { canUse, findPrank, pranks } from "@/lib/pranks";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { CALL_CREDIT_COST, twilioConfigured } from "@/lib/twilio";
import { PrankArt } from "@/components/PrankArt";
import { CallStudio } from "./CallStudio";

export const metadata = { title: "Send a prank call" };
export const dynamic = "force-dynamic";

export default async function CallPage({ searchParams }: { searchParams: Promise<{ prank?: string }> }) {
  const { prank: slug } = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(slug ? `/call?prank=${slug}` : "/call")}`);
  const db = supabaseAdmin();
  const [{ data: profile }, { data: bal }] = await Promise.all([
    db.from("profiles").select("plan").eq("id", user.id).single(),
    db.from("credit_balances").select("balance").eq("user_id", user.id).single(),
  ]);
  const plan = profile?.plan ?? "free";
  const chosen = findPrank(slug);
  const callsLive = twilioConfigured();
  const ready = callsLive && plan !== "free";

  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="sticker-sm inline-block -rotate-2 rounded-full bg-hot px-3 py-1 label">real phone call</p>
        <h1 className="mt-4 text-4xl md:text-6xl">Send a prank call.</h1>
        <p className="mt-3 max-w-2xl text-lg font-semibold text-ink/70">
          Your friend gets a text, replies YES, and their phone rings. The AI character talks to them live, and you get the recording. {CALL_CREDIT_COST} credits per call.
        </p>

        <div className="mt-8">
          {ready ? (
            <CallStudio pranks={pranks} initialSlug={chosen?.slug} plan={plan} credits={bal?.balance ?? 0} cost={CALL_CREDIT_COST} />
          ) : (
            <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
              <div className="sticker rounded-3xl bg-panel p-6">
                {!callsLive ? (
                  <>
                    <p className="text-2xl font-extrabold">Real calls are switching on soon.</p>
                    <p className="mt-2 font-semibold text-ink/70">
                      We&apos;re finishing phone-carrier approval so calls and texts reach your friends reliably. Until then, you can try pranks on yourself in the browser.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-extrabold">Real calls are on Plus and Pro.</p>
                    <p className="mt-2 font-semibold text-ink/70">Plus includes about 13 real calls a month. You can still try free pranks in your browser.</p>
                  </>
                )}
                <div className="mt-5 flex flex-wrap gap-3">
                  {callsLive && <Link href="/pricing" className="sticker-sm press rounded-full bg-volt px-6 py-3 font-extrabold">See plans</Link>}
                  {chosen && canUse(plan, chosen.tier) && (
                    <Link href={`/demo?prank=${chosen.slug}`} className="sticker-sm press rounded-full bg-ink px-6 py-3 font-extrabold text-volt">
                      ▶ Try this prank in your browser
                    </Link>
                  )}
                  <Link href="/pranks" className="sticker-sm press rounded-full bg-panel px-6 py-3 font-extrabold">Browse pranks</Link>
                </div>
              </div>
              {chosen && (
                <div className="sticker overflow-hidden rounded-3xl bg-panel">
                  <PrankArt prank={chosen} />
                  <div className="p-4">
                    <p className="label text-ink/60">You picked</p>
                    <h2 className="mt-1 text-xl leading-tight">{chosen.title}</h2>
                    <p className="mt-1.5 text-sm font-medium text-ink/75">{chosen.blurb}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
