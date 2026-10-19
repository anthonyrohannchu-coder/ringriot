import Link from "next/link";
import { redirect } from "next/navigation";
import { characters, publicCharacter } from "@/lib/characters";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { twilioConfigured } from "@/lib/twilio";
import { CallStudio } from "./CallStudio";

export const metadata = { title: "Real call" };
export const dynamic = "force-dynamic";

export default async function CallPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/call");
  const db = supabaseAdmin();
  const [{ data: profile }, { data: bal }] = await Promise.all([
    db.from("profiles").select("plan").eq("id", user.id).single(),
    db.from("credit_balances").select("balance").eq("user_id", user.id).single(),
  ]);
  const plan = profile?.plan ?? "free";

  return (
    <section className="px-4 py-10">
      <div className="mx-auto max-w-6xl">
        <p className="sticker-sm inline-block -rotate-2 rounded-full bg-hot px-3 py-1 label">real phone call</p>
        <h1 className="mt-4 text-4xl md:text-6xl">Prank your friend&apos;s actual phone.</h1>
        <p className="mt-3 max-w-2xl text-lg font-semibold text-ink/70">
          Pick a character. Your friend gets a text, replies YES, and their phone rings. The character talks to them live and you get the recording.
        </p>

        <div className="mt-8">
          {!twilioConfigured() ? (
            <div className="sticker rounded-3xl bg-volt p-6 text-lg font-bold">Real calls are switching on soon. Try a character in the browser meanwhile.</div>
          ) : plan === "free" ? (
            <div className="sticker rounded-3xl bg-panel p-6">
              <p className="text-xl font-extrabold">Real calls are on Plus and Pro.</p>
              <Link href="/pricing" className="sticker-sm press mt-4 inline-block rounded-full bg-volt px-6 py-3 font-extrabold">See plans</Link>
            </div>
          ) : (
            <CallStudio characters={characters.map(publicCharacter)} plan={plan} credits={bal?.balance ?? 0} />
          )}
        </div>
      </div>
    </section>
  );
}
