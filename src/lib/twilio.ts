import crypto from "node:crypto";
import { brand } from "@/config/brand";

// Minimal Twilio REST client + helpers (no SDK needed).
// Env: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER (+1XXXXXXXXXX).

export function twilioConfigured() {
  return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
}

const sid = () => process.env.TWILIO_ACCOUNT_SID!;
const token = () => process.env.TWILIO_AUTH_TOKEN!;
const auth = () => "Basic " + Buffer.from(`${sid()}:${token()}`).toString("base64");
const base = () => `https://api.twilio.com/2010-04-01/Accounts/${sid()}`;

async function post(path: string, form: Record<string, string>) {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Twilio ${path} ${res.status}: ${data?.message ?? "error"}`);
  return data;
}

export async function sendSms(to: string, body: string) {
  return post("/Messages.json", { To: to, From: process.env.TWILIO_PHONE_NUMBER!, Body: body });
}

export async function startCall(to: string, requestId: string) {
  const app = brand.appUrl;
  return post("/Calls.json", {
    To: to,
    From: process.env.TWILIO_PHONE_NUMBER!,
    Url: `${app}/api/twilio/voice?req=${requestId}&sig=${sign(requestId)}`,
    StatusCallback: `${app}/api/twilio/status`,
    StatusCallbackEvent: "initiated ringing answered completed",
    Record: "true",
    RecordingStatusCallback: `${app}/api/twilio/status?kind=recording`,
    TimeLimit: String(MAX_CALL_SECONDS),
  });
}

export async function fetchRecording(recordingSid: string) {
  return fetch(`${base()}/Recordings/${encodeURIComponent(recordingSid)}.mp3`, { headers: { Authorization: auth() } });
}

/** Point the Twilio number's incoming-SMS webhook at this site (idempotent). */
let numberConfigured = false;
export async function ensureNumberWebhook() {
  if (numberConfigured) return;
  const num = process.env.TWILIO_PHONE_NUMBER!;
  const res = await fetch(`${base()}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(num)}`, { headers: { Authorization: auth() } });
  const data = await res.json();
  const n = data?.incoming_phone_numbers?.[0];
  if (!n) throw new Error("TWILIO_PHONE_NUMBER is not a number on this Twilio account");
  const smsUrl = `${brand.appUrl}/api/twilio/sms`;
  if (n.sms_url !== smsUrl) await post(`/IncomingPhoneNumbers/${n.sid}.json`, { SmsUrl: smsUrl, SmsMethod: "POST" });
  numberConfigured = true;
}

// ---------- safety + limits ----------
export const MAX_CALL_SECONDS = 180;
export const MAX_CALL_TURNS = 8;
export const CALL_CREDIT_COST = 3;
export const USER_REQUESTS_PER_DAY = 10;
export const RECIPIENT_REQUESTS_PER_DAY = 3;

const TOLL_FREE = new Set(["800", "833", "844", "855", "866", "877", "888"]);

/** US/Canada mobile-style numbers only. Blocks N11 (911 etc.), toll-free and malformed numbers. */
export function normalizeNumber(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) d = d.slice(1);
  if (d.length !== 10) return null;
  const area = d.slice(0, 3), exch = d.slice(3, 6);
  if (!/[2-9]/.test(area[0]) || !/[2-9]/.test(exch[0])) return null;
  if (area[1] === "1" && area[2] === "1") return null; // N11
  if (exch[1] === "1" && exch[2] === "1") return null;
  if (TOLL_FREE.has(area) || area === "900") return null;
  return `+1${d}`;
}

export function hashNumber(e164: string) {
  return crypto.createHmac("sha256", process.env.DEMO_COOKIE_SECRET || "pepper").update(e164).digest("hex");
}

/** Texts only between 8am and 9pm in both Eastern and Pacific time (covers most of the US). */
export function withinQuietHours(now = new Date()) {
  const hour = (tz: string) => Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(now)) % 24;
  const et = hour("America/New_York"), pt = hour("America/Los_Angeles");
  return et >= 8 && et < 21 && pt >= 8 && pt < 21;
}

// ---------- signing our own URLs (so only Twilio-started calls can fetch audio/turns) ----------
export function sign(value: string) {
  return crypto.createHmac("sha256", process.env.DEMO_COOKIE_SECRET || "dev").update(value).digest("base64url").slice(0, 24);
}
export function checkSig(value: string, sig: string | null) {
  if (!sig) return false;
  const a = Buffer.from(sign(value)), b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Verify a webhook really came from Twilio (X-Twilio-Signature). */
export function validTwilioRequest(fullUrl: string, params: Record<string, string>, signature: string | null) {
  if (!signature || !process.env.TWILIO_AUTH_TOKEN) return false;
  const data = fullUrl + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const expected = crypto.createHmac("sha1", token()).update(Buffer.from(data, "utf-8")).digest("base64");
  const a = Buffer.from(expected), b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Read a Twilio form POST and verify it. Uses the public URL, since Render's internal URL differs. */
export async function readTwilioForm(req: Request) {
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => (params[k] = String(v)));
  const u = new URL(req.url);
  const fullUrl = `${brand.appUrl}${u.pathname}${u.search}`;
  return { params, ok: validTwilioRequest(fullUrl, params, req.headers.get("x-twilio-signature")) };
}

// ---------- TwiML ----------
export const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
export function twiml(inner: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`, { headers: { "Content-Type": "text/xml" } });
}
