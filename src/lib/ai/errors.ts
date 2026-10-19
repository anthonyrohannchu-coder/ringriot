// Turn an AI provider failure into a short, SECRET-FREE description with a fix hint.
// Works with the Anthropic SDK's APIError shape ({ status, error: { error: { type, message } } }),
// aborts/timeouts, and network errors, without importing the SDK.

export type AIErrorKind =
  | "auth" | "permission" | "model" | "billing" | "rate_limit" | "overloaded" | "bad_request"
  | "server" | "timeout" | "network" | "unknown";

export type AIErrorInfo = { kind: AIErrorKind; status: number | null; type: string | null; message: string; hint: string };

/** Removes anything that looks like an API key or auth header value. */
export function redactSecrets(s: string) {
  return s
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "sk-ant-[REDACTED]")
    .replace(/\b(x-api-key|authorization|api[_-]?key)(["'\s:=]+)(Bearer\s+)?[^\s"',}]+/gi, "$1$2[REDACTED]");
}

type ErrLike = {
  name?: string; status?: number; message?: string; code?: string;
  error?: { type?: string; message?: string; error?: { type?: string; message?: string } };
  cause?: { code?: string; message?: string };
};

export function describeAIError(err: unknown, model?: string): AIErrorInfo {
  const e = (err ?? {}) as ErrLike;
  const status = typeof e.status === "number" ? e.status : null;
  const inner = e.error?.error ?? e.error;
  const type = inner?.type && inner.type !== "error" ? inner.type : null;
  const raw = inner?.message || e.message || String(err);
  const message = redactSecrets(raw).slice(0, 300);
  const m = model ? ` (${model})` : "";

  const info = (kind: AIErrorKind, hint: string): AIErrorInfo => ({ kind, status, type, message, hint });

  if (e.name === "APIUserAbortError" || e.name === "AbortError" || e.name === "TimeoutError" || e.name === "APIConnectionTimeoutError" || /aborted|timed? ?out/i.test(raw) && status === null) {
    return info("timeout", "The request took longer than the call's AI time limit; check your network, or the provider status page.");
  }
  if (status === null && (e.name === "APIConnectionError" || e.name === "TypeError" || /fetch failed|ENOTFOUND|ECONNRESET|ECONNREFUSED|EAI_AGAIN|network/i.test(`${raw} ${e.code ?? ""} ${e.cause?.code ?? ""}`))) {
    return info("network", "Couldn't reach api.anthropic.com from this machine (DNS, proxy, firewall or offline).");
  }
  if (status === 401 || type === "authentication_error") {
    return info("auth", "ANTHROPIC_API_KEY was rejected. Use the full key from console.anthropic.com > API Keys (no quotes or spaces), and check it isn't revoked.");
  }
  if (status === 403 || type === "permission_error") {
    return info("permission", `This key's workspace isn't allowed to use this model${m}. Check the key's workspace and model access in the Anthropic Console.`);
  }
  if (status === 404 || type === "not_found_error") {
    return info("model", `Model not found for this key${m}. Set ANTHROPIC_MODEL to a model your account lists in the Anthropic Console.`);
  }
  if (/credit balance|billing|purchase credits/i.test(raw)) {
    return info("billing", "The Anthropic account has no usable credit. Add credits in the Anthropic Console > Plans & Billing.");
  }
  if (status === 429 || type === "rate_limit_error") return info("rate_limit", "Rate limited. Wait a minute or raise the account's rate limits.");
  if (status === 529 || type === "overloaded_error") return info("overloaded", "The API is temporarily overloaded. Retry shortly.");
  if (status === 400 || type === "invalid_request_error") return info("bad_request", "The API rejected the request itself (see message): this is a code or parameter problem, not your key.");
  if (status !== null && status >= 500) return info("server", "Provider-side error. Retry shortly.");
  return info("unknown", "Unexpected error; see message.");
}

export function formatAIError(i: AIErrorInfo) {
  return `${i.kind}${i.status ? ` ${i.status}` : ""}${i.type ? ` ${i.type}` : ""}: ${i.message}`;
}
