// Change the brand in one place (or via NEXT_PUBLIC_BRAND_NAME).
export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "RingRiot",
  tagline: "AI characters that turn any call into chaos.",
  supportEmail: "support@ringriot.com",
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};
