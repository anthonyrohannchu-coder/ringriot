import { characters, publicCharacter } from "@/lib/characters";
import { DemoChat } from "@/components/DemoChat";
import { findPrank, pranks } from "@/lib/pranks";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";

export const metadata = { title: "Try a prank free" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ c?: string; s?: string; prank?: string }> }) {
  const { c, s, prank } = await searchParams;
  const chosen = findPrank(prank);
  const user = await getUser().catch(() => null);
  let plan = "free";
  if (user) {
    const { data } = await supabaseAdmin().from("profiles").select("plan").eq("id", user.id).single();
    plan = data?.plan ?? "free";
  }
  const paid = plan !== "free";
  return (
    <section className="px-4 py-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-1 text-3xl">{paid ? "Studio" : "Free demo"}</h1>
        <p className="mb-6 text-ink/70">{paid ? "Each new conversation uses 1 credit." : "Pick a situation and answer the call. Free pranks only; upgrade for the rest."}</p>
        <DemoChat
          characters={characters.map(publicCharacter)}
          mode={paid ? "paid" : "demo"}
          pranks={pranks}
          initialCharacterId={chosen?.characterId ?? (characters.some((x) => x.id === c) ? c : undefined)}
          initialScenarioId={chosen?.scenarioId ?? s}
        />
      </div>
    </section>
  );
}
