// Central plan config. Prices are display values; the charged amount is whatever
// the Stripe Price ID is set to, so keep them in sync in the Stripe dashboard.
//
// 1 credit = one AI conversation session (up to MAX_TURNS_PER_SESSION replies
// with voice). Real phone calls (Phase 4) are planned at 3 credits per minute.

export type PlanId = "free" | "plus" | "pro";

export const MAX_TURNS_PER_SESSION = 12;
export const FREE_DEMO_REPLIES_PER_DAY = 6;
export const DAILY_SESSION_CAP = { free: 0, plus: 15, pro: 40 } as const;

export const plans = {
  free: {
    id: "free" as const,
    name: "Free Demo",
    priceLabel: "$0",
    monthlyCredits: 0,
    features: [
      `${FREE_DEMO_REPLIES_PER_DAY} AI replies a day in the browser demo`,
      "3 starter characters",
      "Browser voices",
    ],
    stripePriceEnv: null,
  },
  plus: {
    id: "plus" as const,
    name: "Plus",
    priceLabel: "$9.99",
    monthlyCredits: 40,
    features: [
      "40 credits every month",
      "All standard characters",
      "Saved conversations + transcripts",
      "Caption + hook generator for clips",
    ],
    stripePriceEnv: "STRIPE_PRICE_PLUS",
  },
  pro: {
    id: "pro" as const,
    name: "Pro",
    priceLabel: "$19.99",
    // 60, not 100: with premium voices on every reply, 100 left only ~16% worst-case margin (see README).
    monthlyCredits: 60,
    features: [
      "60 credits every month",
      "Pro-only characters and scenarios",
      "Premium AI voices",
      "Remove clip watermark",
    ],
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
} satisfies Record<PlanId, unknown>;

export const creditPack = {
  credits: 25,
  priceLabel: "$4.99",
  stripePriceEnv: "STRIPE_PRICE_CREDITS_25",
};

export function planForPriceId(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_PLUS) return "plus";
  if (priceId === process.env.STRIPE_PRICE_PRO) return "pro";
  return null;
}
