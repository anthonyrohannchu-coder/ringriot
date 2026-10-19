import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/server";

// Creates an account without sending any email (no email rate limits, no redirect setup).
// The browser then signs in with the same email + password.
const Body = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "Enter a valid email and a password of at least 8 characters." }, { status: 400 });
  }
  const ref = req.cookies.get("rr_ref")?.value;
  const { error } = await supabaseAdmin().auth.admin.createUser({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: ref ? { ref } : {},
  });
  if (error && /already|registered|exists/i.test(error.message)) {
    // An account that was created (e.g. by an old email-link attempt) but never logged into
    // holds no data, so let the person claim it by setting their password.
    const { data: unusedId } = await supabaseAdmin().rpc("unused_account_id", { p_email: parsed.data.email });
    if (unusedId) {
      const { error: upd } = await supabaseAdmin().auth.admin.updateUserById(unusedId as string, {
        password: parsed.data.password,
        email_confirm: true,
      });
      if (!upd) return NextResponse.json({ ok: true, claimed: true });
      console.error("claim failed", upd.message);
    }
  }
  if (error) {
    const exists = /already|registered|exists/i.test(error.message);
    console.error("signup failed", error.message);
    return NextResponse.json(
      { error: exists ? "exists" : "signup_failed", message: exists ? "That email already has an account. Log in instead." : "Couldn't create the account. Try again in a moment." },
      { status: exists ? 409 : 500 },
    );
  }
  return NextResponse.json({ ok: true });
}
