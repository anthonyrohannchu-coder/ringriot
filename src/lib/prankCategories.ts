// Client-safe prank types and helpers (no prompts). Import this, not pranks.ts, from client components.
export const categories = [
  { id: "relationship", label: "Relationship drama", short: "Drama", color: "#ff4fa3" },
  { id: "orders", label: "Orders & deliveries", short: "Orders", color: "#ffd60a" },
  { id: "confront", label: "Confrontations", short: "Beef", color: "#ff8a3d" },
  { id: "mixup", label: "Wrong number & mix-ups", short: "Mix-ups", color: "#3d7bff" },
  { id: "absurd", label: "Totally ridiculous", short: "Ridiculous", color: "#9b8cff" },
] as const;
export type CategoryId = (typeof categories)[number]["id"];

export type Tier = "free" | "plus" | "pro";

export type Prank = {
  slug: string;
  characterId: string;
  scenarioId: string;
  title: string;
  blurb: string;
  category: CategoryId;
  icon: string;
  isNew: boolean;
  pick: number | null;
  tier: Tier;
  accent: string;
  opener: string;
};

export function categoryOf(id: CategoryId) {
  return categories.find((c) => c.id === id)!;
}

const rank: Record<Tier, number> = { free: 0, plus: 1, pro: 2 };
export function canUse(plan: string, tier: Tier) {
  return (rank[plan as Tier] ?? 0) >= rank[tier];
}
