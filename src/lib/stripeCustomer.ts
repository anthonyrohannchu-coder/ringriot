// Stripe customer ids saved while the site ran on TEST keys don't exist in LIVE mode (and vice versa).
// A stale id must never block checkout, billing or account deletion, so callers treat it as "no customer".

/** True when Stripe says the customer doesn't exist for this key (deleted, or from the other mode). */
export function isMissingCustomerError(err: unknown) {
  const e = err as { code?: string; type?: string; message?: string; raw?: { code?: string; message?: string } } | null;
  if (!e) return false;
  const code = e.code ?? e.raw?.code;
  const msg = e.message ?? e.raw?.message ?? "";
  return code === "resource_missing" && /customer/i.test(msg);
}

/**
 * Returns the stored customer id if it exists for the current Stripe key, otherwise null.
 * `retrieve` is injected so this is testable without network.
 */
export async function usableCustomerId(
  stored: string | null | undefined,
  retrieve: (id: string) => Promise<{ deleted?: unknown } | null>,
): Promise<string | null> {
  if (!stored) return null;
  try {
    const c = await retrieve(stored);
    return c && c.deleted !== true ? stored : null;
  } catch (err) {
    if (isMissingCustomerError(err)) return null;
    throw err;
  }
}
