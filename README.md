# RingRiot

Mobile-first website for AI comedy characters: free browser demo → signup → Stripe subscription → credits.
Brand name is configurable (`NEXT_PUBLIC_BRAND_NAME`, `src/config/brand.ts`).

## Status

| Area | State |
| --- | --- |
| Landing page, character gallery, pricing, FAQ, legal pages | Built |
| Free browser demo (text + mic input, character voices, clip caption kit) | Built. Works with no keys using scripted lines; real AI replies with `ANTHROPIC_API_KEY` |
| Magic-link auth, persistent sessions, dashboard, privacy controls, account deletion | Built. Needs Supabase keys |
| Credit ledger (row-locked reserve/settle/refund, idempotent, daily caps) | Built (`supabase/migrations/0001_init.sql`) |
| Stripe Checkout, verified webhooks, renewals, failed payments, Customer Portal, credit packs | Built. Needs Stripe test keys + products. **Not verified until you run the test flow below.** |
| Creator referral links `/r/<code>`, signup attribution, commission records, refund adjustment | Built (tracking only, no automated payouts) |
| Premium voices (ElevenLabs) for Pro | Built behind a flag; needs key + voice IDs you have rights to |
| Real phone calls | Core Twilio SMS-consent → outbound call → AI turns/status/recording routes are present; requires Twilio credentials, provisioned numbers, public HTTPS URL, and migrations 0001 + 0002. Must be tested end to end before launch. |
| Admin dashboard, analytics overview, video clip rendering | **Not built yet** (next phases) |

This was written without being able to run `npm install` (the build sandbox had no registry access). Run the build once and send me any errors.

## Setup (about 20 minutes)

1. `npm install`
2. `cp .env.example .env.local` and fill in values as you go.
3. **Supabase**: create a project → SQL editor → run `supabase/migrations/0001_init.sql`, then `supabase/migrations/0002_real_calls.sql`. Copy URL, anon key, service-role key. In Auth → URL configuration, add `http://localhost:3000/auth/callback` and your production URL.
4. **AI**: get an Anthropic API key at console.anthropic.com → `ANTHROPIC_API_KEY`. Leave blank to use scripted lines.
5. **Stripe (test mode)**:
   - Products → create **Plus** ($9.99 monthly), **Pro** ($19.99 monthly), **25 Credits** ($4.99 one-time). Put the three Price IDs in env (`STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_CREDITS_25`; comma-separate to keep older prices mapped). The app never creates or edits Stripe products, prices, webhooks or portal settings.
   - Settings → Billing → Customer portal → enable cancel, switch plans (Plus ↔ Pro), update payment method.
   - Webhook endpoint `https://<your-domain>/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`. Copy the signing secret.
   - Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the `whsec_` it prints.
6. `openssl rand -hex 32` → `DEMO_COOKIE_SECRET`
7. `npm run dev` → http://localhost:3000

## Automated tests

- `npm test`: billing rules (price → plan mapping, which invoices grant credits, out-of-order events) and the account-deletion sequence (blocking, ordering, rollback), run with fakes and a copy of a real sandbox invoice.
- `tests/sql/run.sh "-h <socket-dir> -p <port> -U <user>"`: credit-ledger idempotency and referral/account-deletion checks for a **throwaway local Postgres only** (the script refuses Supabase/Render hosts). It reproduces the referral foreign-key bug on the current schema, applies `supabase/migrations/0003_preserve_referrals_on_account_deletion.sql` twice on existing data, then verifies referral history survives deletion.

**Migration 0003 is not applied anywhere.** Until it is, account deletion is refused (before any subscription is touched) for users who have referral conversions on either side, so history is never erased or left half-deleted.

## Configure Twilio phone calls (not enabled until configured)

1. Provision one or more phone numbers on your Twilio account with SMS and voice capability.
2. Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBERS` to a comma-separated list of those exact E.164 numbers (for example `+15551234567,+15557654321`). Do not list numbers you do not control.
3. Set `NEXT_PUBLIC_APP_URL` to the public HTTPS Render URL. Twilio webhooks must be able to reach it.
4. Apply both Supabase migrations, including `0002_real_calls.sql`, before enabling calls.
5. Verify the account's regulatory/consent requirements, recording laws, and Twilio messaging/voice setup. Run test calls only to numbers you control or recipients who explicitly opt in.
6. The call flow texts the recipient first; only an affirmative reply initiates a call. Recording disclosure is provided in the SMS and at the beginning of the call. Test SMS STOP, YES, no-answer refunds, and recording access before launch.

## Prank-call scenarios

Scenarios live in `src/lib/scenarios.ts` (persona, setup, escalation beats, ending, no-AI fallback lines) and are attached to characters in `src/lib/characters.ts`. On a live call, `src/lib/callFlow.ts` sends the chosen scenario, the full transcript so far, the sender's name and the number of replies left to the AI every turn. The AI can end the call itself (`<end>`), the last turn is always a wrap-up, "stop"/"hang up" ends it without calling the AI, and two silent turns in a row end it.

`npm run call:check` first sends one preflight request and stops with the exact (secret-free) provider error if it's rejected; a real-AI run FAILS if any turn falls back to a canned line. Each transcript line is tagged AI / AI FAILED → fallback / SCRIPTED / safeguard.

Try any scenario from your terminal through the same conversation code (no phone, database or credits): `npm run call:sim -- list`, then e.g. `npm run call:sim -- sal hit-my-car Anthony`. It uses `ANTHROPIC_API_KEY` from your shell if set, otherwise the scripted lines.

**Before deploying the caller-number picker**, apply `supabase/migrations/0004_call_requests_caller_number.sql` (adds `call_requests.from_e164`); without it every call request fails. `0002_real_calls.sql` documents the table the live project already has; don't run it there.

## Launch checks

- `GET /api/health`: liveness for Render's health check / an uptime pinger (no database, no secrets).
- `GET /api/admin/readiness` (signed in as an `ADMIN_EMAILS` user; everyone else gets 404): read-only verification of every setting the code needs (env vars, Supabase migrations 0003/0004, Stripe account/prices/webhook/portal, Twilio account type and number ownership/capabilities, app URL vs. this host). Add `?ai=1` to run two real AI turns ("Wait, who is Bernadette?", "Are you an AI?"). Never returns secret values.
- Migration order for the live project (neither is applied yet): `0004_call_requests_caller_number.sql` (required before deploying this code), then `0003_preserve_referrals_on_account_deletion.sql` (recommended). Both are compatible with the code currently on `main`. Rollbacks: `supabase/rollbacks/0004_down.sql`, `supabase/rollbacks/0003_down.sql` (0003's refuses once any deletion has detached referral history).
- Quiet hours: consent texts go out only 8am–6pm Pacific (= 8am–9pm in both Eastern and Pacific).

## Test the payment flow before going live

1. Sign up, open Pricing, buy Plus with card `4242 4242 4242 4242`.
2. Dashboard should show Plus and 40 credits (from the webhook, not the success page).
3. `stripe trigger invoice.paid` style renewals: in the Stripe dashboard, use a test clock to advance a month → +40 credits once.
4. Card `4000 0000 0000 0341` → payment fails → status `past_due` warning on dashboard.
5. Cancel in the portal → plan returns to Free at period end.
6. Buy a credit pack → +25. Resend the same webhook event from Stripe → balance must not change.

**Going live**: activate your Stripe account, recreate the products in live mode, swap to `sk_live_` keys, live price IDs and a live webhook secret on your host, then repeat step 1 with a real card and refund yourself.

## Deploy (Vercel)

Import the repo, add every variable from `.env.example`, deploy, then point the Stripe webhook and Supabase redirect URLs at the production domain. Note: the free-demo IP counter is in memory; move it to Upstash Redis or the database before heavy traffic.

## Credits and margins (estimates — re-check against current price pages)

1 credit = one conversation of up to 12 AI replies. Assumptions: ~15k input + ~1k output tokens per conversation at $1 / $5 per million tokens ≈ **$0.02**; premium voice ~1,400 characters at ~$0.10 per 1k ≈ **$0.14**; Stripe ≈ 2.9% + $0.30.

| Plan | Price | Credits | Worst-case cost (all credits used) | Gross margin |
| --- | --- | --- | --- | --- |
| Plus | $9.99 | 40, browser voices | $0.80 AI + $0.59 Stripe = $1.39 | ~86% |
| Pro | $19.99 | 60, premium voices | $9.60 AI+voice + $0.88 Stripe = $10.48 | ~48% |
| Pro at 100 credits (original idea) | $19.99 | 100 | $16.88 | ~16% → **not recommended**, so Pro is set to 60 |
| Credit pack | $4.99 | 25 | up to $4.00 with premium voice + $0.44 | ~11–80% depending on voice |

Most subscribers use far fewer than all their credits, so real margins run higher. Planned phone calls at 3 credits/minute need telephony + realtime voice costs checked before launch.

## Domain ideas (none contain "claude")

Check availability at a registrar (Namecheap, Cloudflare, Porkbun) — I couldn't verify from here:
`ringriot.com`, `ringriot.app`, `getringriot.com`, `ringriot.fun`, `prankpal.ai`, `dialchaos.com`.

## Adding a character

Append an object to `src/lib/characters.ts` (name, personality prompt, voice pitch/rate, scenarios, fallback lines). It appears in the gallery, demo and prompts automatically.

## Content rules baked in

Every character prompt forbids threats, slurs, impersonating real people or organizations, and asking for personal or payment info, and drops the bit if someone is upset. Demos are labeled "browser simulation · not a real phone call". Characters and lines are original; nothing is copied from other prank apps.
