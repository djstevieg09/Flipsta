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
- [ ] In the SQL editor, run every migration **in order**: `0001_init.sql`, `0002_admin_ops.sql` (admin dashboard/tickets/partners/reviews/tax), `0003_cross_posting.sql` (multi-platform listing), `0004_auth_profile_trigger.sql` (auto-creates a profile on signup — sign-up won't work at all without this one), `0005_seller_order_visibility.sql` (lets a seller see their own sales), `0006_subscription_billing.sql` (Stripe subscription id, for self-serve tier upgrades — see section 3), `0007_channel_connections.sql` (stores each seller's connected marketplace accounts — see section 9) — then `supabase/seed.sql` for sample data to develop against.
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
- [ ] Dashboard → Developers → Webhooks: add an endpoint pointing at `https://<your-render-url>/api/webhooks/stripe`, listening for at least `payment_intent.succeeded`, `payment_intent.payment_failed`, `checkout.session.completed`, `customer.subscription.updated`, and `customer.subscription.deleted` (the last three power the self-serve tier upgrade flow below — without them, a paid upgrade would take payment but never actually change the account's tier). Copy the **signing secret** → `STRIPE_WEBHOOK_SECRET`.
- [ ] **For the `/upgrade` self-serve subscription flow:** Dashboard → Product catalogue → create one Product per paid tier (Standard, Pro, Elite) with a **recurring monthly Price** on each — the actual amount is your call (Section 7 of the planning doc has suggested ranges, but nothing in the code enforces those numbers, they're just the UI's display text). Copy each Price's ID (starts `price_...`) → `STRIPE_PRICE_STANDARD`, `STRIPE_PRICE_PRO`, `STRIPE_PRICE_ELITE` on the `flipsta-web` service.
- [ ] Also enable the **Customer Portal** (Dashboard → Settings → Billing → Customer portal) with its defaults — this is what powers the "Manage billing" button on `/upgrade` for existing subscribers.
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

The worker currently uses a mock data source (`apps/worker/src/adapters/mockAdapter.ts`) so the whole pipeline runs without any of this — do this when you're ready to find real deals.

- [ ] **This one's already wired and ready to flip on, no extra account needed:** the same `ANTHROPIC_API_KEY` set on the `flipsta-worker` Render service also drives real *discovery*, not just scoring. `apps/worker/src/adapters/claudeSearchAdapter.ts` uses Claude's own web search to find products currently on genuine discount/clearance, then searches a resale/second-hand site for what the same item actually sells for, so the margin is based on real evidence rather than a guess — this is the alternative to Keepa (below), built per Steven's request (24 Aug) rather than relying on Amazon pricing alone. `apps/worker/src/index.ts` picks this adapter automatically the moment the key is set (falls back to the mock adapter otherwise); it also switches the discovery interval from every 5 minutes (mock, free) to every 2 hours by default, since this one does real, billed web searches (~$10 per 1,000 searches, plus normal token cost) — override the cadence with `DISCOVERY_INTERVAL_MINUTES` on Render once you've seen real costs in the Anthropic console. Note this is not scraping and doesn't attempt to bypass any site's bot-detection — it only reads what an ordinary Claude web search already surfaces.
- [ ] Worth spot-checking the first several real runs: Render's worker logs print the resale-evidence URL Claude used to justify each accepted deal, so you can sanity-check a handful before trusting the pipeline unattended.
- [ ] Keepa API account (~£25-45+/month depending on plan — Section 9.1 of the business doc) is still an option if you'd rather have a dedicated, structured pricing-history data source for Amazon specifically → `KEEPA_API_KEY`, then implement `apps/worker/src/adapters/keepaAdapter.ts` (currently a labelled stub, unused now that the Claude-search adapter is wired in as the default real path). Not required — the Claude web-search adapter above is a genuine alternative, not a placeholder waiting for this.
- [ ] Retailer affiliate programmes (LEGO UK via Rakuten Advertising/FlexOffers, per Section 8.2) — sign up once you're ready to route purchases through tracked links. Separate from the Awin integration directly below — that one's about publisher commission on referred sales, this one's about Flipsta itself buying through a tracked link when it sources an opportunity; not built yet.
- [ ] **Awin affiliate integration (27 Aug 2026, Steven's own new revenue stream, separate from the core arbitrage business)** — fully built on Flipsta's side (`/partner-deals` public page, `/admin/partner-deals`, migration `0025`, `apps/worker/src/jobs/syncAwinProducts.ts`), inert until you complete these steps yourself (account creation needs your own business details — not something that can be done on your behalf):
  1. Sign up as an Awin publisher at [awin.com](https://www.awin.com) — free, no cost to just list products.
  2. Apply to join 2-3 merchant "programmes" relevant to Flipsta's categories (the confirmed pilot scope — `/admin/partner-deals` shows you every programme you're approved for once the token below is set, and lets you add each one to the sync one at a time). Each merchant approves separately, usually within a few days.
  3. Generate your API token at [ui.awin.com/awin-api](https://ui.awin.com/awin-api) (enter your account password, copy the token shown). Find your Publisher ID on your Awin account dashboard.
  4. Set `AWIN_API_TOKEN` and `AWIN_PUBLISHER_ID` on **both** `flipsta-web` (powers the admin programme picker) and `flipsta-worker` (runs the actual product sync, every 6 hours) — already scaffolded in `render.yaml`, both `sync: false`.
  5. Once set, visit `/admin/partner-deals`, add your first 2-3 merchants, and give the worker one sync cycle (or redeploy it) to see products land on `/partner-deals`.
  - How it works: products stay listed on the merchant's own site — `/partner-deals` sends a shopper there via Awin's tracked link, Flipsta earns a commission on the sale, and never touches payment, shipping, or stock for these. The same real price data also feeds a "real price benchmark" signal into the AI discovery prompt (`claudeSearchAdapter.ts`) for whichever categories have enough synced products (3+) — Steven: "then you can use this info to help search better."
  - **Not independently verified yet**: the two REST endpoints used (auth, joined-programmes lookup) are confirmed against Awin's own published API docs. The product feed list/download parsing follows Awin's long-documented CSV column conventions but couldn't be tested against a real response (no publisher account existed yet while this was built) — spot-check the first real sync's output in `/admin/partner-deals` (product counts per merchant) and the worker logs, same discipline already applied to claudeSearchAdapter's real discovery runs above.

## 7. Shipping

- [ ] DPD and Evri both require a business courier account to get real rates/labels via API — or use an aggregator like **Shippo** or **EasyPost**, which support UK couriers under one integration instead of separate contracts with each. Worth comparing before committing to either DPD or Evri directly.
- [ ] Set up the DPD affiliate programme (via the Shopper.com network) once you have real order volume, per Section 8.2.

## 8. Email

- [ ] Now wired into the codebase (`apps/web/lib/notifications.ts`, used on ticket status changes) but running in console-stub mode until you set a key. **Resend** or **Postmark** are both good fits for a Next.js app.
- [ ] Sign up, verify your sending domain (flipsta.co.uk), copy the API key → `RESEND_API_KEY`, and set `NOTIFICATIONS_FROM_EMAIL` to a real address on that domain.

## 9. Multi-platform listing — external marketplace accounts

There are two separate things here, easy to conflate: **Flipsta's own developer
registration** on each platform (this section, one-time, only you can do it —
account creation, business verification, agreeing to their API terms), and
**each seller's one-click "Connect account"** (already built — see
`/settings/connections`, `apps/web/lib/channelOAuth.ts` — a seller signs into
their own account on that platform and grants access, no API key ever shown
to them). The second only lights up once the first is done for a given
channel: with no credentials set, that channel's "Connect" button shows
"not connectable yet" instead of a broken flow.

- [ ] The channel list was updated (2026) to prioritise platforms with a real, documented, self-serve seller API — swapping out Amazon/Facebook Marketplace/Vinted in favour of Etsy/Whatnot/StockX, and correcting Depop's status (it now has an official API, where the original build assumed it didn't). Register Flipsta as a developer/app on each active channel, then set the matching env vars on `flipsta-web` (already scaffolded in `render.yaml`, all `sync: false`):
  - [ ] **eBay** — self-serve. Register an OAuth application at the eBay Developers Program (developer.ebay.com) → a Trading/Sell API app with an `sell.inventory` scope. Set `CHANNEL_EBAY_CLIENT_ID` / `CHANNEL_EBAY_CLIENT_SECRET`. The authorize/token URLs are already built in — nothing else to set.
  - [ ] **Etsy** — self-serve. Apply for a Keystring (client id) via Etsy's developer portal (developers.etsy.com) for Etsy Open API v3. Set `CHANNEL_ETSY_CLIENT_ID` only — Etsy's flow is PKCE-based and doesn't use a client secret. Authorize/token URLs are already built in.
  - [ ] **Depop** — gated. Email Depop's Partner API team (partnerapi.depop.com) to request access; they'll issue a client id/secret and give you your specific authorize/token URLs (these aren't publicly published — they're issued per partner). Set all four: `CHANNEL_DEPOP_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`, `_TOKEN_URL`.
  - [ ] **Whatnot** — gated. Contact Whatnot's developer team to register a client app and your redirect URI (`https://<your-render-url>/api/channel-connections/whatnot/callback`); they generate the secret and give you the endpoint URLs. Set all four: `CHANNEL_WHATNOT_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`, `_TOKEN_URL`.
  - [ ] **StockX** — gated, application/review process via the StockX Developer Portal, and their OAuth pages sit behind PerimeterX bot-detection (a reason to budget more lead time here, not to script around it — see the note below). Once approved, confirm the exact flow with StockX and set all four: `CHANNEL_STOCKX_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTHORIZE_URL`, `_TOKEN_URL`.
  - [ ] Deprioritised, kept in mind for later rather than built against now:
    - **Amazon** — Amazon Selling Partner API access exists, but requires an active Amazon seller account first, and Amazon is often not the cheapest source anyway (worth revisiting only if there's a specific business reason to add it back).
    - **Vinted** — still no public seller API as of this document; a real integration would need a direct partnership conversation with Vinted.
    - **Facebook Marketplace** — Meta Commerce/Catalog API access exists via a Meta Business account, but was deprioritised in favour of the channels above.
- [ ] For each channel, once its developer credentials are set, register `https://<your-render-url>/api/channel-connections/<channel>/callback` as that platform's OAuth redirect URI in their developer settings — most platforms reject the login if this doesn't match exactly.
- [ ] Run `supabase/migrations/0007_channel_connections.sql` — this is what stores each seller's connected account.
- [ ] None of this blocks launch, and nothing here requires all five channels — set up one (Etsy is the simplest self-serve option) and the rest can follow later. Even once a seller is connected, the actual "create a listing on their behalf" API call to each platform is still a labelled stub (`packages/shared/src/salesChannels.ts: publishListingToChannel()`) — connecting the account and posting the listing are two separate pieces of work, and only the first is done.
- [ ] **On bot-detection generally:** several of these platforms (StockX in particular) actively gate automated access with bot-detection (PerimeterX and similar). The right response to that is the official API + application process above, or a paid data/API provider — never scripting around the gate itself; that's a real legal/ToS risk and not something built here.

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
