// Client-safe prank types and helpers (no prompts). Import this, not pranks.ts, from client components.
export const categories = [
  { id: "relationship", label: "Relationship drama", short: "Drama", color: "#ff4fa3", keywords: "love dating girlfriend boyfriend ex crush jealous romance" },
  { id: "orders", label: "Orders & deliveries", short: "Orders", color: "#ffd60a", keywords: "food order restaurant takeout delivery pizza fast food ride" },
  { id: "confront", label: "Confrontations", short: "Beef", color: "#ff8a3d", keywords: "angry beef argument complaint neighbor rival" },
  { id: "mixup", label: "Wrong number & mix-ups", short: "Mix-ups", color: "#3d7bff", keywords: "wrong number confused mistaken identity stranger" },
  { id: "absurd", label: "Totally ridiculous", short: "Ridiculous", color: "#9b8cff", keywords: "funny weird silly random absurd" },
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
