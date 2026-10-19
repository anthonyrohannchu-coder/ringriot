import crypto from "node:crypto";
import { FREE_DEMO_REPLIES_PER_DAY } from "@/config/plans";

// Free demo allowance, enforced on the server two ways:
// 1) an HMAC-signed cookie (count + day) the browser can't forge, and
// 2) a per-IP counter, so clearing cookies doesn't reset the limit.
// For multi-instance deploys, move the IP counter to Redis/Upstash or the DB.

const ipCounts = new Map<string, { day: string; n: number }>();
const secret = () => process.env.DEMO_COOKIE_SECRET || "dev-only-insecure-secret";
const today = () => new Date().toISOString().slice(0, 10);

function sign(payload: string) {
  return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function readDemoCookie(value: string | undefined) {
  if (!value) return 0;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return 0;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return 0;
  const [day, n] = Buffer.from(payload, "base64url").toString().split(":");
  return day === today() ? Number(n) || 0 : 0;
}

export function writeDemoCookie(n: number) {
  const payload = Buffer.from(`${today()}:${n}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function checkAndCountIp(ip: string) {
  const d = today();
  const cur = ipCounts.get(ip);
  const n = cur && cur.day === d ? cur.n : 0;
  // IPs are shared (schools, carriers), so allow 3x the per-person limit.
  if (n >= FREE_DEMO_REPLIES_PER_DAY * 3) return false;
  ipCounts.set(ip, { day: d, n: n + 1 });
  return true;
}
