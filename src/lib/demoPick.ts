// Which prank the demo opens on. Client-safe and unit-tested.
import type { Prank } from "@/lib/prankCategories";

export type DemoMode = "demo" | "paid";

/** In the free demo only free pranks can start, so a deep link to a Plus/Pro prank falls back to a free one. */
export function pickStartPrank(pranks: Prank[], mode: DemoMode, characterId?: string, scenarioId?: string): Prank {
  const usable = (p: Prank) => mode !== "demo" || p.tier === "free";
  return (
    pranks.find((p) => usable(p) && p.characterId === characterId && p.scenarioId === scenarioId) ??
    pranks.find((p) => usable(p) && p.characterId === characterId) ??
    pranks.find(usable) ??
    pranks[0]
  );
}
