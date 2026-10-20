import { getUser } from "@/lib/supabase/server";

/** True when the signed-in user is listed in ADMIN_EMAILS. */
export async function isAdmin() {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const user = await getUser().catch(() => null);
  return !!(admins.length && user?.email && admins.includes(user.email.toLowerCase()));
}
