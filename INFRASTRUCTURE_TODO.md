# Infrastructure to-do

Everything here is something only you can do — account creation, payment
details, DNS you own. Nothing in this codebase calls out to any of these
services yet without the keys below being set, so it's safe to work through
this at your own pace before anything goes live.

## 1. Get the code onto GitHub

You said you already have GitHub — this codebase was built locally and was
deliberately **not** pushed anywhere, since doing that without asking first
would be publishing to your account without permission.

- [ ] Create a new (private, to start) repo in your GitHub account.
- [ ] From the unzipped project folder: `git remote add origin <your-repo-url>`, then `git push -u origin main`.

## 2. Supabase — the database

- [ ] Create a new Supabase project (or use an existing one, if you'd rather keep this separate from anything else on your account).
- [ ] In the SQL editor, run every migration **in order**: `0001_init.sql`, `0002_admin_ops.sql` (admin dashboard/tickets/partners/reviews/tax), `0003_cross_posting.sql` (multi-platform listing), `0004_auth_profile_trigger.sql` (auto-creates a profile on signup — sign-up won't work at all without this one), `0005_seller_order_visibility.sql` (lets a seller see their own sales) — then `supabase/seed.sql` for sample data to develop against.
- [ ] Auth → Settings: for testing, consider turning **off** "Confirm email" so a freshly signed-up test account can sign in immediately without clicking an email link. Turn it back on before real users sign up.
- [ ] Project Settings → API: copy the **Project URL** and **anon public key** → these become `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- [ ] Same page: copy the **service_role key** (keep this one secret, server-only) → `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Auth → Providers: email/password is enabled by default, which is all the app currently uses. Add social logins later if you want them.
- [ ] Consider upgrading off the free tier before real user data is stored — the free tier pauses inactive projects and has no point-in-time backup.
- [ ] **To reach the admin dashboard:** after your own account has signed up once, open the Table Editor → `profiles`, find your row, and set `role` to `admin`. There's no self-service way to become staff — deliberately.

## 3. Stripe — payments & the escrow mechanic

- [ ] Create a Stripe account if you don't have one, and enable **Stripe Connect** (Dashboard → Connect → Get started). This is what lets sellers get paid out while you still control when funds release.
- [ ] Choose **Express** accounts for sellers (the standard choice for a marketplace like this — Stripe handles most of the onboarding UI for you).
- [ ] Dashboard → Developers → API keys: copy the **secret key** → `STRIPE_SECRET_KEY`. Use a *test mode* key until you're ready to take real payments.
- [ ] Dashboard → Developers → Webhooks: add an endpoint pointing at `https://<your-render-url>/api/webhooks/stripe`, listening for at least `payment_intent.succeeded` and `payment_intent.payment_failed`. Copy the **signing secret** → `STRIPE_WEBHOOK_SECRET`.
- [ ] Later, before accepting real payments: Stripe will ask for business verification details (Companies House number, once Flipsta is registered — see the planning doc's next-steps note) and your UK bank account for payouts.

## 4. Render — deploying the app

- [ ] In the Render dashboard: New → Blueprint, point it at your GitHub repo. It will read `render.yaml` and propose two services: `flipsta-web` and `flipsta-worker`.
- [ ] For each service, fill in the environment variables marked `sync: false` in `render.yaml` using the values you collected above.
- [ ] Deploy. `flipsta-web` serves the site; `flipsta-worker` runs the background jobs (discovery, auction closing, escrow release) continuously.
- [ ] Once it's live, go back to Stripe and update the webhook URL to the real Render URL if you set it up before deploying.

## 5. Domain & DNS

- [ ] You already own flipsta.co.uk. Point it at Render: Render dashboard → your web service → Settings → Custom Domain, then add the CNAME/A record Render gives you at your domain registrar.
- [ ] Strongly recommend putting **Cloudflare** in front of it (free tier) once live — the research for this project already ran into eBay's bot-detection just from manual price checks; a real storefront will get scraped and probed from day one, and Cloudflare's free tier alone stops a lot of that.

## 6. Data sources for the AI discovery engine

The worker currently uses a mock data source (`apps/worker/src/adapters/mockAdapter.ts`) so the whole pipeline runs without any of this — do this when you're ready to find real deals:

- [ ] Keepa API account (~£25-45+/month depending on plan — Section 9.1 of the business doc) → `KEEPA_API_KEY`, then implement `apps/worker/src/adapters/keepaAdapter.ts` (currently a labelled stub).
- [ ] Retailer affiliate programmes (LEGO UK via Rakuten Advertising/FlexOffers, per Section 8.2) — sign up once you're ready to route purchases through tracked links.
- [ ] **This one's already wired and ready to flip on:** an Anthropic API account → `ANTHROPIC_API_KEY`, set on the `flipsta-worker` Render service. The moment it's set, every newly discovered deal gets scored by a real Claude call (`apps/worker/src/aiScoring.ts`) instead of the margin/volatility heuristic — no further code changes needed. Note this scores deals the mock/Keepa adapter already found; it doesn't replace Keepa for *finding* deals in the first place.

## 7. Shipping

- [ ] DPD and Evri both require a business courier account to get real rates/labels via API — or use an aggregator like **Shippo** or **EasyPost**, which support UK couriers under one integration instead of separate contracts with each. Worth comparing before committing to either DPD or Evri directly.
- [ ] Set up the DPD affiliate programme (via the Shopper.com network) once you have real order volume, per Section 8.2.

## 8. Email

- [ ] Now wired into the codebase (`apps/web/lib/notifications.ts`, used on ticket status changes) but running in console-stub mode until you set a key. **Resend** or **Postmark** are both good fits for a Next.js app.
- [ ] Sign up, verify your sending domain (flipsta.co.uk), copy the API key → `RESEND_API_KEY`, and set `NOTIFICATIONS_FROM_EMAIL` to a real address on that domain.

## 9. Multi-platform listing — external marketplace accounts

- [ ] The `/sell/new` auto cross-post switch (Section 7) currently simulates a successful post to every channel — see `packages/shared/src/salesChannels.ts`. Each of these needs its own seller/developer API account before it can go live for real:
  - [ ] **eBay** — eBay Developers Program account + a Trading/Sell API OAuth application.
  - [ ] **Amazon** — Amazon Selling Partner API access, which requires an active Amazon seller account first.
  - [ ] **Vinted** — no public seller API as of this document; a real integration may need a partnership conversation with Vinted directly, worth confirming before committing engineering time here.
  - [ ] **Facebook Marketplace** — Meta Commerce/Catalog API access via a Meta Business account.
  - [ ] **Depop** — added as a strong fit for the trainers/streetwear/collectibles audience, not in the original plan; no public seller API as of this document either — confirm feasibility before committing to it as a launch channel.
- [ ] None of this blocks launch — the toggle, the per-channel tracking, and the worker retry sweep all work today against the stub; this is purely about making the actual external post real.

## 10. Monitoring (do this before launch, not after an incident)

- [ ] **Sentry** — free tier is enough to start; catches errors from both the web app and the worker.
- [ ] Render's built-in logs are fine initially; revisit if you need longer retention or full-text log search.

## 11. Legal / compliance (carried over from the planning doc — still outstanding)

- [ ] UK trademark search via the IPO before public launch (flagged when the Flipsta name was chosen).
- [ ] Register "Flipsta" at Companies House if not already done.
- [ ] A UK financial services solicitor's review before Version 1 (the short-selling exchange) ever goes live — Section 3.1 flags a real FCA risk around forward-contract regulation.
- [ ] The draft Terms & Conditions in `legal/terms-and-conditions-draft.md` (Section 12.7) needs a solicitor's review before publishing, alongside a Privacy Policy, Cookie Policy, and Seller Agreement — none of which exist yet.
- [ ] Seller tax reporting (Section 12.6) — the `seller_tax_info` schema and `isHmrcReportableSeller()` check exist, but confirm the current HMRC digital platform reporting thresholds/deadlines with an accountant before the onboarding UI (still to be built — see STATUS.md) goes live.

---

**Suggested order:** 1 → 2 → 4 (deploy with the mock worker adapter and Stripe
in stub mode, so you can see the real site running before spending anything)
→ 3 → 5 → the rest as you need them.
