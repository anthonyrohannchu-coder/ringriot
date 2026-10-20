// Standing consent: a friend agrees ONCE to get AI prank calls from one sender, and every later prank
// from that sender rings straight through. Required because AI-voice calls to cell phones need the
// called person's prior consent (TCPA). STOP always revokes everything (blocked_numbers).

/** consent_records.kind values that count as standing consent. Older one-off "recipient_sms_yes" rows don't. */
export const STANDING_KINDS = ["standing_yes", "standing_invite"] as const;

export type Reply =
  | { kind: "stop"; word: string }
  | { kind: "yes"; code: string | null }
  | { kind: "other" };

const STOP = /^(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|NO|BLOCK)\b/;
const YES = /^(YES|Y|YEA|YEAH|YEP|OK|OKAY|SURE)\b/;

/** Parse a text from a friend. "YES ab12cd34" carries a sender's invite code. */
export function parseReply(raw: string): Reply {
  const body = raw.trim().toUpperCase().replace(/[!.]+$/g, "");
  const stop = body.match(STOP);
  if (stop) return { kind: "stop", word: stop[1] };
  if (!YES.test(body)) return { kind: "other" };
  const code = body.split(/\s+/).slice(1).find((w) => /^[A-Z0-9]{6,12}$/.test(w));
  return { kind: "yes", code: code ? code.toLowerCase() : null };
}

/** Text the friend gets the first time. Says plainly that YES covers future pranks from this sender. */
export function consentText(o: { senderName: string; characterName: string; archetype: string; brand: string }) {
  return (
    `${o.senderName} sent you a prank call from ${o.characterName} (${o.archetype}), an AI comedy character on ${o.brand}. ` +
    `Calls are recorded and may be shared by ${o.senderName}. Reply YES to get it now; future pranks from ${o.senderName} will then ring you directly. ` +
    `Reply STOP anytime to block all ${o.brand} texts and calls.`
  );
}

/** The sms: link the invite page uses, so the friend's own phone sends the opt-in. */
export function inviteSmsHref(toNumber: string, code: string) {
  return `sms:${toNumber}?&body=${encodeURIComponent(`YES ${code.toUpperCase()}`)}`;
}
