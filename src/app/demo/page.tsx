import { characters, publicCharacter } from "@/lib/characters";
import { DemoChat } from "@/components/DemoChat";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { premiumTtsEnabled } from "@/lib/tts";

export const metadata = { title: "Try a character" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c } = await searchParams;
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
        <p className="mb-6 text-ink/70">{paid ? "Each new conversation uses 1 credit." : "Free characters only. Upgrade for the full cast."}</p>
        <DemoChat
          characters={characters.map(publicCharacter)}
          mode={paid ? "paid" : "demo"}
          initialCharacterId={characters.some((x) => x.id === c) ? c : undefined}
          premiumVoice={paid && plan === "pro" && premiumTtsEnabled()}
        />
      </div>
    </section>
  );
}
