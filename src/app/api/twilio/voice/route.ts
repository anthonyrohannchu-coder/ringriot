import { checkSig, readTwilioForm, twiml } from "@/lib/twilio";
import { answer, loadRequest } from "@/lib/callEngine";

// Twilio fetches this when the friend picks up.
export async function POST(req: Request) {
  const { ok } = await readTwilioForm(req);
  const url = new URL(req.url);
  const id = url.searchParams.get("req") ?? "";
  if (!ok || !checkSig(id, url.searchParams.get("sig"))) return new Response("forbidden", { status: 403 });
  const r = await loadRequest(id);
  if (!r) return twiml("<Hangup/>");
  return answer(r);
}
