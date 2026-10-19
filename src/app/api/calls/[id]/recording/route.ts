import { NextResponse } from "next/server";
import { getUser, supabaseAdmin } from "@/lib/supabase/server";
import { fetchRecording } from "@/lib/twilio";

// Streams a call recording to its owner only. Recordings are never public URLs.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return new NextResponse("unauthorized", { status: 401 });
  const { id } = await params;
  const { data } = await supabaseAdmin().from("call_requests").select("user_id, recording_sid").eq("id", id).maybeSingle();
  if (!data || data.user_id !== user.id || !data.recording_sid) return new NextResponse("not found", { status: 404 });
  const res = await fetchRecording(data.recording_sid);
  if (!res.ok || !res.body) return new NextResponse("unavailable", { status: 502 });
  return new NextResponse(res.body, {
    headers: { "Content-Type": "audio/mpeg", "Content-Disposition": `inline; filename="ringriot-call-${id.slice(0, 8)}.mp3"`, "Cache-Control": "private, no-store" },
  });
}
