import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { getCharacter } from "@/lib/characters";
import { plans, type PlanId } from "@/config/plans";
import { brand } from "@/config/brand";
import { BillingButton, DeleteAccount, DeleteSession, PrivacySettings, SignOut } from "./AccountActions";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const user = await getUser();
  if (!user) redirect("/login?next=/dashboard");
  const db = supabaseAdmin();

  const [{ data: profile }, { data: bal }, { data: sub }, { data: sessions }, { data: txs }, { data: ref }] = await Promise.all([
    db.from("profiles").select("*").eq("id", user.id).single(),
    db.from("credit_balances").select("balance").eq("user_id", user.id).single(),
    db.from("subscriptions").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    db.from("conversation_sessions").select("id, character_id, turns, status, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    db.from("credit_transactions").select("id, amount, status, reason, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(10),
    db.from("referral_codes").select("code, commission_rate").eq("user_id", user.id).maybeSingle(),
  ]);

  const plan = plans[(profile?.plan ?? "free") as PlanId];

  return (
    <section className="px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex items-end justify-between">
          <div>
            <p className="label text-ink/70">Signed in as {user.email}</p>
            <h1 className="mt-1 text-4xl">Your dashboard</h1>
          </div>
          <SignOut />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="sticker rounded-3xl bg-panel p-5">
            <p className="label text-ink/70">Plan</p>
            <p className="mt-2 display text-3xl">{plan.name}</p>
            {sub && (
              <p className="mt-1 text-sm text-ink/70">
                {sub.status === "past_due" ? "⚠ Payment failed, update your card" : sub.cancel_at_period_end ? "Cancels" : "Renews"}
                {sub.current_period_end ? ` ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}
              </p>
            )}
          </div>
          <div className="sticker rounded-3xl bg-volt p-5">
            <p className="label text-ink/70">Credits</p>
            <p className="mt-2 display text-5xl">{bal?.balance ?? 0}</p>
            <p className="mt-1 text-sm text-ink/70">1 credit = 1 conversation</p>
          </div>
          <div className="flex flex-col justify-between gap-3 sticker rounded-3xl bg-panel p-5">
            <Link href="/demo" className="sticker-sm press rounded-full bg-volt py-3 text-center font-bold text-ink">Start a conversation</Link>
            {profile?.plan === "free" ? (
              <Link href="/pricing" className="sticker-sm press rounded-full bg-panel py-3 text-center font-semibold">Upgrade</Link>
            ) : (
              <BillingButton />
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="sticker rounded-3xl bg-panel p-5">
            <h2 className="text-lg font-bold">Recent conversations</h2>
            {!sessions?.length ? (
              <p className="mt-3 text-sm text-ink/70">Nothing yet. <Link href="/demo" className="underline">Start your first one</Link>. Blaze is waiting.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {sessions.map((s) => {
                  const c = getCharacter(s.character_id);
                  return (
                    <li key={s.id} className="flex items-center justify-between py-2.5">
                      <span>{c?.name ?? s.character_id} · {s.turns} replies</span>
                      <span className="flex items-center gap-3 text-ink/70">
                        {new Date(s.created_at).toLocaleDateString()}
                        <DeleteSession id={s.id} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="sticker rounded-3xl bg-panel p-5">
            <h2 className="text-lg font-bold">Credit history</h2>
            {!txs?.length ? (
              <p className="mt-3 text-sm text-ink/70">Credits appear here after you subscribe or buy a pack.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {txs.map((t) => (
                  <li key={t.id} className="flex justify-between py-2.5">
                    <span className="truncate pr-3">{t.reason}</span>
                    <span className={t.amount > 0 ? "font-bold text-go" : "text-ink/70"}>
                      {t.amount > 0 ? "+" : ""}{t.amount} {t.status === "refunded" && "(refunded)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="sticker rounded-3xl bg-panel p-5">
            <h2 className="text-lg font-bold">Creator link</h2>
            <p className="mt-1 text-sm text-ink/70">Share it. You earn {Math.round(Number(ref?.commission_rate ?? 0.3) * 100)}% of every paid month from people who sign up through it.</p>
            {ref && <code className="mt-3 block break-all rounded-xl bg-paper p-3 text-sm font-bold border-2 border-dashed border-ink">{brand.appUrl}/r/{ref.code}</code>}
          </div>
          <div className="sticker rounded-3xl bg-panel p-5">
            <h2 className="text-lg font-bold">Privacy</h2>
            <PrivacySettings save={profile?.save_transcripts ?? true} days={profile?.transcript_retention_days ?? 30} />
          </div>
        </div>

        <div className="sticker rounded-3xl bg-panel p-5">
          <h2 className="text-lg font-bold">Delete account</h2>
          <p className="mt-1 text-sm text-ink/70">Stops all future charges and permanently deletes your conversations, clips and credits. If your plan is paid through a later date, you'll be asked first.</p>
          <DeleteAccount />
        </div>
      </div>
    </section>
  );
}
