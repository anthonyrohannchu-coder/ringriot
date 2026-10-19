import { checkSig, readTwilioForm, twiml } from "@/lib/twilio";
import { loadRequest, turn } from "@/lib/callEngine";

// Twilio posts what the friend said (speech-to-text); we answer in character.
export async function POST(req: Request) {
  const { params, ok } = await readTwilioForm(req);
  const url = new URL(req.url);
  const id = url.searchParams.get("req") ?? "";
  if (!ok || !checkSig(id, url.searchParams.get("sig"))) return new Response("forbidden", { status: 403 });
  const r = await loadRequest(id);
  if (!r || r.status !== "in_progress") return twiml("<Hangup/>");
  return turn(r, params.SpeechResult ?? "");
}
