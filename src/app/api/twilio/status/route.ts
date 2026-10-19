import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { refundCredits, settleCredits } from "@/lib/credits";
import { readTwilioForm } from "@/lib/twilio";

// Call lifecycle + recording-ready callbacks from Twilio.
export async function POST(req: Request) {
  const { params, ok } = await readTwilioForm(req);
  if (!ok) return new NextResponse("forbidden", { status: 403 });
  const db = supabaseAdmin();
  const callSid = params.CallSid;
  if (!callSid) return NextResponse.json({ ok: true });

  const { data: r } = await db.from("call_requests").select("id, user_id, status, credit_tx_id").eq("twilio_call_sid", callSid).maybeSingle();
  if (!r) return NextResponse.json({ ok: true });

  if (new URL(req.url).searchParams.get("kind") === "recording") {
    if (params.RecordingSid && params.RecordingStatus === "completed") {
      const { data: prof } = await db.from("profiles").select("transcript_retention_days").eq("id", r.user_id).single();
      const days = prof?.transcript_retention_days ?? 30;
      await db.from("call_requests").update({ recording_sid: params.RecordingSid }).eq("id", r.id);
      await db.from("recordings").insert({ user_id: r.user_id, storage_path: `twilio:${params.RecordingSid}`, delete_after: new Date(Date.now() + days * 86400_000).toISOString() });
    }
    return NextResponse.json({ ok: true });
  }

  const status = params.CallStatus;
  if (status === "completed") {
    const answered = r.status === "in_progress";
    await db.from("call_requests").update({ status: answered ? "completed" : "no_answer", ended_at: new Date().toISOString(), to_e164: null }).eq("id", r.id);
    if (r.credit_tx_id) answered ? await settleCredits(r.credit_tx_id) : await refundCredits(r.credit_tx_id, "not answered");
  } else if (["busy", "no-answer", "failed", "canceled"].includes(status)) {
    await db.from("call_requests").update({ status: status === "failed" ? "failed" : "no_answer", ended_at: new Date().toISOString(), to_e164: null }).eq("id", r.id);
    if (r.credit_tx_id) await refundCredits(r.credit_tx_id, `call ${status}`);
  }
  return NextResponse.json({ ok: true });
}
