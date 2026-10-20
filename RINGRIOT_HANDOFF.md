# RingRiot handoff

_Written 2026-10-20 00:30 PT by Claude (session https://claude.ai/code/session_01VCNApEn4DQM1hwZZviBJAC). No secrets in this file. Key values live only in Render and the provider dashboards._

Status labels: **COMPLETED AND VERIFIED** · **IMPLEMENTED BUT NOT TESTED** · **PARTIALLY IMPLEMENTED** · **PLANNED ONLY** · **BLOCKED**

---

## 1. What RingRiot is and where everything lives

- **Product:** RingRiot is an AI prank-call comedy site.
  - **Browser demo:** free, with a few replies a day.
  - **Real calls:** for paying users. The friend gets a consent text first and only gets called after replying YES. Each call opens with a notice that it's AI and that it's recorded.
- **Live site:** https://ringriot.onrender.com, on Render's free instance (it cold-starts after inactivity).
- **Code:** GitHub `anthonyrohannchu-coder/ringriot`, branch `main`.
  - Stack: Next.js 15 App Router, React 19, Tailwind 4.
  - Render auto-deploys on every push to `main`.
- **Hosting:** Render service `srv-dbb36p3ncjis73avsolg`.
  - Last deploy `dep-dbbhcjjncjis738otha0`, commit `1366a1f` (PR #5), status live at 07:22 UTC on 2026-10-20.
- **Database and auth:** Supabase project `azfimpgjafvkkmsvceeq`. Migrations 0001–0004 are applied.
- **Payments:** Stripe account "Nexor Tech" `acct_1UPq8ZEMSO0nX4L6`.
- **Phone:** Twilio account (SID ends `…aba45`), caller number +1 208 443 8421.
- **AI:** Anthropic API (`AI_PROVIDER` is set on Render).
- **Voice:** ElevenLabs is used for prank-preview clips only. Live calls use Twilio's natural Google Chirp3-HD voices.
- **Render env var names** (values are never recorded here):
  - ADMIN_EMAILS, AI_PROVIDER, ANTHROPIC_API_KEY, DEMO_COOKIE_SECRET
  - NEXT_PUBLIC_APP_URL, NEXT_PUBLIC_BRAND_NAME, NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
  - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_PLUS / _PRO / _CREDITS_25. The price vars are set to the placeholder "use-lookup-keys", so prices are resolved by lookup key.
  - TTS_PROVIDER, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBERS
  - Optional: ELEVENLABS_API_KEY, ELEVENLABS_FOR_CALLS=1 (switches live calls to ElevenLabs, which costs more), ELEVENLABS_PREVIEW_MODEL.
- **Admin pages:** both require signing in with an ADMIN_EMAILS address.
  - `/api/admin/readiness` is a read-only launch check. Add `?ai=1` to run two real AI turns.
  - `/api/admin/previews`: GET shows status. POST `?limit=10` records the missing preview clips; `&force=1` re-records, `&slug=` does one prank.
- **Plans:**
  - Free: browser demo.
  - Plus: $9.99/mo, 40 credits.
  - Pro: $19.99/mo, 60 credits.
  - Credit pack: $4.99 for 25 credits.
  - A real call costs 3 credits. They're reserved when the friend says YES and refunded if the call isn't answered.

## 2. Website and product changes (all merged to `main` and deployed)

| Work | Status |
|---|---|
| PR #2: billing fixes, prank scenarios, readiness checks | COMPLETED AND VERIFIED: deployed; readiness showed no blockers |
| PR #3: prank-library redesign (`/pranks`, homepage, categories, 11 new scenarios) | COMPLETED AND VERIFIED: deployed; pages viewed |
| PR #4: a unique face and natural phone voice per prank, barge-in during calls, 10 more pranks (60+ total), 90 tests | COMPLETED AND VERIFIED: deployed; tests passed |
| PR #5: `/call` rebuilt as a 5-step flow (Prank → Friend Number → Prank Caller Number → Details/consent → Review), then a live status tracker and result card | IMPLEMENTED BUT NOT TESTED in a browser. Deployed at 07:22 UTC; typecheck clean; 95 unit tests pass. The screens haven't been looked at yet. |
| PR #5: server-side checks, so the Prank Caller Number must be one of the provisioned numbers (no spoofing) and the friend number must be US/CA | COMPLETED AND VERIFIED by unit tests; live request not yet exercised |
| PR #5: standalone "premium AI voice" product removed (`/api/tts` deleted, plan copy changed) | COMPLETED AND VERIFIED in code; deployed |
| PR #5: ElevenLabs preview clips for each prank (Preview buttons and the demo's first line), falling back to the device voice | IMPLEMENTED BUT NOT TESTED. No clips have been recorded yet; see §8. |
| PR #5: live calls only use ElevenLabs when `ELEVENLABS_FOR_CALLS=1` | IMPLEMENTED, unit-level only |
| A real end-to-end phone call through the new flow | NOT TESTED: it needs the user's approval and a consenting friend's phone |

Key files:
- **People and pranks:**
  - `src/lib/people.ts`: faces and voices.
  - `src/lib/scenarios.ts`: prank prompts and castings.
  - `src/lib/characters.ts`
  - `src/lib/pranks.ts` and `src/lib/prankCategories.ts`: the client-safe ones.
- **Call steps:**
  - `src/lib/callSteps.ts`: wizard and tracker logic.
  - `src/lib/phone.ts`: shared number validation.
  - `src/app/call/CallStudio.tsx`
  - `src/app/api/calls/route.ts`
- **Previews:**
  - `src/lib/previewVoices.ts`
  - `src/lib/previewAudio.ts`
  - `src/app/api/admin/previews/route.ts`
- **Calls and billing:**
  - `src/lib/callFlow.ts`
  - `src/lib/tts.ts`
  - `src/app/api/twilio/*`
  - `src/app/api/stripe/*`
  - `src/lib/stripePrices.ts`
  - `src/lib/readiness.ts`
- **Tests:** `tests/*.test.ts`. Run them with `npx tsx --test tests/*.test.ts`.

## 3. Payments (Stripe)

| Item | Status |
|---|---|
| Live products and prices, found by lookup keys `ringriot_plus` / `ringriot_pro` / `ringriot_credits_25` | COMPLETED AND VERIFIED: created in the live dashboard |
| Live webhook "ringriot-production" `we_1USX1LEMSO0nX4L63OmDmL2z` → `/api/stripe/webhook`, 7 events | COMPLETED AND VERIFIED: created |
| Customer portal, set to cancel at the end of the billing period | COMPLETED AND VERIFIED: configured |
| Site switched from test to **live** keys | UNVERIFIED. The user said they updated `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `ELEVENLABS_API_KEY` and redeployed (deploy at 07:20 UTC). I couldn't open `/api/admin/readiness` to confirm "live mode" before the session ended. **The next session must check this first.** |
| Real payment test | NOT DONE. Never enter card numbers on the production site; the owner should make one real $4.99 purchase and refund it. |

## 4. Phone (Twilio)

- **Account and caller number:** configured. Readiness showed the number's webhooks correct. **COMPLETED AND VERIFIED**
- **A2P 10DLC SMS registration: BLOCKED.**
  - The owner isn't a registered business; getting an EIN is advised.
  - Until it's registered, US carriers may block the consent text. No YES text means no call.
  - Alternative to consider: have the friend give consent on the phone instead of by text.
- **Unregistered numbers:** the owner once suggested using random numbers as caller IDs. That was **declined**: only Twilio numbers we own can be used, and spoofing is forbidden.

## 5. Marketing and growth

| Work | Status |
|---|---|
| "RingRiot Creator Promo Kit": creator briefs, message prompts, hooks. Doc at https://claude.ai/code/artifact/d7ed2702-b1f2-4158-8315-6a8dec265461 | COMPLETED AND VERIFIED (doc exists) |
| Collabstr campaign | PARTIALLY IMPLEMENTED: saved as a **Draft**. Posting it seems to need a paid Collabstr plan, which isn't approved. Nothing has been paid on Collabstr for RingRiot. |
| Saved Collabstr creator benchmarks: Aliza Khan, Muhammad Qasim, Sarah Russi, Marcela (all ≤$100) | Recorded in the scheduled task's prompt |
| Scheduled task "RingRiot creator picks" (`trig_01EDBAZd7MMMrrLKazSi8Vzm`): every other day at 7:52 AM PT. It reads Collabstr emails in Gmail, ranks creators and drafts messages; it never contacts anyone or spends. Next run 2026-10-21 14:52 UTC. | IMPLEMENTED BUT NOT TESTED: it hasn't run yet. Configured in claude.ai scheduled tasks. |
| Automated scraping/browsing of Collabstr | Deliberately NOT done: Collabstr's terms ban bots |
| Growth-operator system: creator database, content calendar, affiliate tracking, ad experiments, weekly and monthly reports for RingRiot | PLANNED ONLY. The owner's brief (Oct 20) is saved below in §10. Nothing is built yet. |
| Affiliate/referral system | PARTIALLY IMPLEMENTED: a `referral_codes` table exists in Supabase (migration 0003). There's no creator-facing affiliate dashboard or payouts. |
| Paid ads (TikTok, Meta, Google) | PLANNED ONLY. Nothing launched or spent. |
| Analytics and conversion tracking | PLANNED ONLY. No analytics tool installed. Purchases are visible only in Stripe and Supabase. |

## 6. Money

- **RingRiot revenue:** none verified yet. No real purchases have been seen.
- **Ad spend and creator fees:** none for RingRiot.
- **Recurring costs:**
  - Render: free plan.
  - Supabase: free tier, assumed.
  - Twilio: number about $1.15/mo plus usage.
  - Anthropic API: usage-based.
  - ElevenLabs: whatever plan the owner has.
  - None of these were checked against invoices in this session.
- **Unrecovered spend:** a $100 Collabstr escrow from a different business (Chu Call) is mentioned in other scheduled tasks. It is not RingRiot spend.

## 7. Other scheduled tasks on this account (not RingRiot; leave them alone)

- **Active:**
  - Chu Call: "Daily team-leader recruiting", "weekly growth report" and "monthly economics review".
- **Disabled:**
  - Nexor: "partner outreach drafts", "weekly sales report", "SEO guide".
  - Chu Call: "1,000-business email push".

## 8. Open items, in priority order

1. **Confirm Stripe is live.** Open `/api/admin/readiness` while signed in as admin. It should report `live mode`, the 3 live prices, the webhook and the portal. Then open checkout from `/pricing` and confirm it doesn't say "Sandbox".
2. **Record the previews.**
   - Check that `ELEVENLABS_API_KEY` is present on Render.
   - In the browser while signed in as admin, run `fetch('/api/admin/previews',{method:'POST'})` repeatedly with `?limit=10`. The whole set is about 12k characters with `eleven_multilingual_v2`.
   - Watch the ElevenLabs quota. On the free tier, use `&model=eleven_turbo_v2_5` (half the credits).
   - Then click Preview on `/pranks` and listen.
3. **Look at the new `/call` steps in a browser,** on mobile and desktop.
4. **With the owner's approval, make one real test call** to the owner's own phone.
5. **A2P 10DLC.** Decide between getting an EIN and registering, or switching consent to a phone call.
6. **Build the growth system from §10.** Start with analytics and purchase tracking (no spend needed), then a creator CRM and referral links.

## 9. Constraints the owner set (keep following them)

- **Approval required** before: merging or deploying (the owner has been approving each one), applying migrations, changing live provider settings or prices, **spending money**, hiring creators, launching ads, signing contracts, and starting real calls or texts.
- **Secrets:** never show them in chat, logs or reports. Never ask the owner to paste keys into chat; they paste them into dashboards themselves.
- **Phone numbers:**
  - No caller-ID spoofing.
  - Only provisioned Twilio numbers.
  - No fake or demo numbers shown to users.
  - Validate everything on the server.
- **Content and safety rules:**
  - Keep the AI and recording disclosures and the friend's YES opt-in.
  - Keep Chad and Earl Pro-only.
  - No ethnic accents or stereotypes.
  - Relationship pranks stay comedic and de-escalate when needed.
  - Don't copy Prank Caller's UI, branding or text.
- **Honesty:**
  - Never claim a feature works until it has been tested.
  - Never treat views or clicks as sales.
- **Collabstr:** no automated browsing or scraping.
- **Expectations:** the owner hopes RingRiot becomes income. Report real revenue honestly, including zero.

## 10. The owner's growth brief (Oct 20, summarized)

The owner wants an ongoing, mostly automated customer-acquisition operation, with Claude acting as growth operator. It should cover:

- **Creator discovery and CRM:** TikTok, Reels and Shorts creators, with outreach status, rates, deliverables and results. Rank creators by paying customers, not views. The owner also asked whether to keep Collabstr or use alternatives.
- **A content pipeline:** hooks, scripts, briefs, captions and a calendar, using only truthful claims.
- **An affiliate system:** trackable links or codes; commission based on real economics.
- **Paid-ad experiments:** only after conversion tracking works; small tests; measure CAC.
- **Conversion work:** landing page, mobile, signup, checkout, onboarding.
- **Real automation:** a single source of truth, scheduled jobs (daily, weekly, monthly), event triggers, dedupe, logging, failure alerts, and human approval for anything financial.
- **Reports** that track expenses, creator fees, visitors, registrations, paying customers, CAC, revenue, margin, refunds, retention, commissions and payback.

## 11. Collabstr vs agency: recommendation

Keep Collabstr, or a similar marketplace, as the main channel for now, and don't hire a growth agency yet. Reasons:

- With $0 in revenue and no conversion tracking, an agency retainer (usually $1–5k a month) would burn money without telling you anything.
- Small $50–100 creator tests can be measured per creator once referral links and purchase tracking exist.

Revisit an agency once there are about 3+ months of data showing which creators produce paying customers.

---

## INSTRUCTIONS FOR THE NEXT CLAUDE SESSION

1. **Read this file first.** It's in the repo `anthonyrohannchu-coder/ringriot` on branch `handoff-notes` (and maybe `main`), and on the owner's Mac at `~/ringriot-review/RINGRIOT_HANDOFF.md`.
2. **Inspect the current state before changing anything:**
   - Clone the repo and run the tests.
   - Check Render deploys for `srv-dbb36p3ncjis73avsolg`.
   - Open `/api/admin/readiness` as admin.
   - List the scheduled tasks.
3. **Continue from here; don't rebuild** anything marked COMPLETED.
4. **Verify integrations, deploys and schedules before saying they work.** Label everything with the statuses at the top of this file.
5. **Work §8 in order.** Then build the growth system in §10 step by step:
   - First: analytics and purchase-event tracking, and per-creator referral links or codes tied to Stripe purchases.
   - Next: a creator CRM. Use an artifact with a shared database, or Supabase tables.
   - Then: scheduled daily, weekly and monthly reporting jobs (claude.ai scheduled tasks), with failure alerts.
   - Then: a content/brief pipeline.
   - Only after tracking is verified: small paid-ad experiments.
6. **Name the external services, permissions, APIs and schedules** needed for each piece, and set them up where access allows.
7. **Keep the owner informed** with short, honest progress updates: real results, blockers and expenses. Never invent numbers.
8. **Get the owner's explicit approval before** spending money, hiring creators or providers, launching paid campaigns, signing contracts, buying subscriptions, merging or deploying, or placing real calls or texts.
