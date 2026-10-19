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
            <p className="label text-muted">Signed in as {user.email}</p>
            <h1 className="mt-1 text-4xl font-extrabold tracking-tight">Your dashboard</h1>
          </div>
          <SignOut />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-line bg-panel p-5">
            <p className="label text-muted">Plan</p>
            <p className="mt-2 text-3xl font-extrabold">{plan.name}</p>
            {sub && (
              <p className="mt-1 text-sm text-muted">
                {sub.status === "past_due" ? "⚠ Payment failed, update your card" : sub.cancel_at_period_end ? "Cancels" : "Renews"}
                {sub.current_period_end ? ` ${new Date(sub.current_period_end).toLocaleDateString()}` : ""}
              </p>
            )}
          </div>
          <div className="rounded-3xl border border-volt/40 bg-volt/[.04] p-5">
            <p className="label text-muted">Credits</p>
            <p className="mt-2 text-5xl font-extrabold text-volt">{bal?.balance ?? 0}</p>
            <p className="mt-1 text-sm text-muted">1 credit = 1 conversation</p>
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-3xl border border-line bg-panel p-5">
            <Link href="/demo" className="rounded-full bg-volt py-3 text-center font-bold text-ink">Start a conversation</Link>
            {profile?.plan === "free" ? (
              <Link href="/pricing" className="rounded-full border border-line py-3 text-center font-semibold">Upgrade</Link>
            ) : (
              <BillingButton />
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-panel p-5">
            <h2 className="text-lg font-bold">Recent conversations</h2>
            {!sessions?.length ? (
              <p className="mt-3 text-sm text-muted">Nothing yet. <Link href="/demo" className="underline">Start your first one</Link>. Delores is waiting.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {sessions.map((s) => {
                  const c = getCharacter(s.character_id);
                  return (
                    <li key={s.id} className="flex items-center justify-between py-2.5">
                      <span>{c?.emoji} {c?.name ?? s.character_id} · {s.turns} replies</span>
                      <span className="flex items-center gap-3 text-muted">
                        {new Date(s.created_at).toLocaleDateString()}
                        <DeleteSession id={s.id} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="rounded-3xl border border-line bg-panel p-5">
            <h2 className="text-lg font-bold">Credit history</h2>
            {!txs?.length ? (
              <p className="mt-3 text-sm text-muted">Credits appear here after you subscribe or buy a pack.</p>
            ) : (
              <ul className="mt-3 divide-y divide-line text-sm">
                {txs.map((t) => (
                  <li key={t.id} className="flex justify-between py-2.5">
                    <span className="truncate pr-3">{t.reason}</span>
                    <span className={t.amount > 0 ? "text-volt" : "text-muted"}>
                      {t.amount > 0 ? "+" : ""}{t.amount} {t.status === "refunded" && "(refunded)"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl border border-line bg-panel p-5">
            <h2 className="text-lg font-bold">Creator link</h2>
            <p className="mt-1 text-sm text-muted">Share it. You earn {Math.round(Number(ref?.commission_rate ?? 0.3) * 100)}% of every paid month from people who sign up through it.</p>
            {ref && <code className="mt-3 block break-all rounded-xl bg-ink p-3 text-sm text-volt">{brand.appUrl}/r/{ref.code}</code>}
          </div>
          <div className="rounded-3xl border border-line bg-panel p-5">
            <h2 className="text-lg font-bold">Privacy</h2>
            <PrivacySettings save={profile?.save_transcripts ?? true} days={profile?.transcript_retention_days ?? 30} />
          </div>
        </div>

        <div className="rounded-3xl border border-hot/30 p-5">
          <h2 className="text-lg font-bold">Delete account</h2>
          <p className="mt-1 text-sm text-muted">Cancels your subscription and permanently deletes your conversations, clips and credits.</p>
          <DeleteAccount />
        </div>
      </div>
    </section>
  );
}
