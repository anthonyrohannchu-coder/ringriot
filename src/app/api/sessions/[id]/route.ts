import { NextResponse } from "next/server";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await supabaseAdmin().from("conversation_sessions").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
