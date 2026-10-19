import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCharacter, getScenario } from "@/lib/characters";
import { getProvider } from "@/lib/ai";
import { FREE_DEMO_REPLIES_PER_DAY } from "@/config/plans";
import { checkAndCountIp, readDemoCookie, writeDemoCookie } from "@/lib/demoLimit";

const Body = z.object({
  characterId: z.string().max(40),
  scenarioId: z.string().max(60),
  spicy: z.boolean().optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "character"]), text: z.string().max(600) }))
    .max(14),
});

const COOKIE = "rr_demo";

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const character = getCharacter(parsed.data.characterId);
  if (!character) return NextResponse.json({ error: "unknown_character" }, { status: 404 });
  if (character.tier !== "free") {
    return NextResponse.json({ error: "upgrade_required", message: `${character.name} is a paid character.` }, { status: 402 });
  }

  const used = readDemoCookie(req.cookies.get(COOKIE)?.value);
  if (used >= FREE_DEMO_REPLIES_PER_DAY) {
    return NextResponse.json(
      { error: "demo_limit", message: "You've used today's free demo replies. Sign up and upgrade to keep going." },
      { status: 429 },
    );
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkAndCountIp(ip)) {
    return NextResponse.json({ error: "demo_limit", message: "Free demo limit reached on this network today." }, { status: 429 });
  }

  try {
    const result = await getProvider().generate({
      character,
      scenario: getScenario(character, parsed.data.scenarioId),
      history: parsed.data.history,
      spicy: parsed.data.spicy === true,
    });
    const res = NextResponse.json({
      text: result.text,
      provider: result.provider,
      remaining: FREE_DEMO_REPLIES_PER_DAY - used - 1,
    });
    res.cookies.set(COOKIE, writeDemoCookie(used + 1), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24,
      path: "/",
    });
    return res;
  } catch (err) {
    console.error("demo generate failed", err);
    // Failed replies don't count against the allowance (cookie not incremented).
    return NextResponse.json({ error: "ai_unavailable", message: "The character dropped the call. Try again." }, { status: 503 });
  }
}
