import { supabaseAdmin, supabaseConfigured } from "@/lib/supabase/server";

type Track = { userId?: string | null; visitorId?: string | null; path?: string | null; ref?: string | null; props?: Record<string, unknown> };

/** Record one analytics event. Never throws and never blocks the request it's called from. */
export async function track(name: string, t: Track = {}) {
  if (!supabaseConfigured()) return;
  try {
    const { error } = await supabaseAdmin().from("events").insert({
      name, user_id: t.userId ?? null, visitor_id: t.visitorId ?? null,
      path: t.path?.slice(0, 200) ?? null, ref: t.ref?.slice(0, 32) ?? null, props: t.props ?? {},
    });
    if (error && !/relation .*events.* does not exist|Could not find the table/i.test(error.message)) console.error("track", name, error.message);
  } catch (err) {
    console.error("track", name, err);
  }
}
