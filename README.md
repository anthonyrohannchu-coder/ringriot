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
| Real phone calls (Phase 4) | **Not built.** Schema has consent + recording tables ready |
| Admin dashboard, analytics overview, video clip rendering | **Not built yet** (next phases) |

This was written without being able to run `npm install` (the build sandbox had no registry access). Run the build once and send me any errors.

## Setup (about 20 minutes)

1. `npm install`
2. `cp .env.example .env.local` and fill in values as you go.
3. **Supabase**: create a project → SQL editor → paste `supabase/migrations/0001_init.sql` → run. Copy URL, anon key, service-role key. In Auth → URL configuration, add `http://localhost:3000/auth/callback` and your production URL.
4. **AI**: get an Anthropic API key at console.anthropic.com → `ANTHROPIC_API_KEY`. Leave blank to use scripted lines.
5. **Stripe (test mode)**:
   - Products → create **Plus** ($9.99 monthly), **Pro** ($19.99 monthly), **25 Credits** ($4.99 one-time). Put the three Price IDs in env (`STRIPE_PRICE_PLUS`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_CREDITS_25`; comma-separate to keep older prices mapped). The app never creates or edits Stripe products, prices, webhooks or portal settings.
   - Settings → Billing → Customer portal → enable cancel, switch plans (Plus ↔ Pro), update payment method.
   - Webhook endpoint `https://<your-domain>/api/stripe/webhook` with events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed`, `charge.refunded`. Copy the signing secret.
   - Locally: `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the `whsec_` it prints.
6. `openssl rand -hex 32` → `DEMO_COOKIE_SECRET`
7. `npm run dev` → http://localhost:3000

## Automated tests

- `npm test`: billing rules (price → plan mapping, which invoices grant credits, out-of-order events, account-deletion handling), run against a copy of a real sandbox invoice.
- `tests/sql/`: credit-ledger idempotency checks for a **throwaway local Postgres only** (never your Supabase project): load `supabase_stub.sql`, then `supabase/migrations/0001_init.sql`, then `ledger.test.sql`; `concurrent_grant.sh` fires 10 parallel identical grants.

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
